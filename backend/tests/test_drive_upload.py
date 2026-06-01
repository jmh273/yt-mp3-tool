import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import httplib2
from googleapiclient.errors import HttpError

import main


def _api_disabled_error() -> HttpError:
    resp = httplib2.Response({"status": 403, "reason": "Forbidden"})
    content = json.dumps(
        {"error": {"code": 403, "message": "Google Drive API has not been used in project 1 before or it is disabled."}}
    ).encode()
    return HttpError(resp, content, uri="https://www.googleapis.com/drive/v3/files")


def test_drive_error_detail_explains_disabled_api():
    msg = main._drive_error_detail(_api_disabled_error())
    assert "Drive API" in msg
    assert "啟用" in msg


def test_drive_error_detail_passes_through_plain_error():
    assert main._drive_error_detail(ValueError("boom")) == "boom"


def test_scopes_include_drive_file():
    assert "https://www.googleapis.com/auth/drive.file" in main.SCOPES


def test_credentials_missing_drive_file_scope_requires_reauth(tmp_path):
    token_file = tmp_path / "token.json"
    token_file.write_text(json.dumps({"scopes": ["https://www.googleapis.com/auth/youtube"]}))
    creds = MagicMock()
    creds.scopes = ["https://www.googleapis.com/auth/youtube"]
    with patch("main._get_current_email", return_value="user@example.com"), \
         patch("main._token_path", return_value=token_file), \
         patch("main.Credentials.from_authorized_user_file", return_value=creds):
        assert main.load_drive_credentials() is None
    # 缺 scope 須回 None 觸發 401，但不可動既有 token（與 YouTube 共用，刪掉會整個登出）
    assert token_file.exists()
    assert not token_file.with_suffix(".json.needs-drive-file").exists()


def test_ensure_drive_folder_reuses_existing_folder():
    service = MagicMock()
    service.files.return_value.list.return_value.execute.return_value = {
        "files": [{"id": "folder-1", "name": "YT-MP3"}]
    }

    folder_id = main._ensure_drive_folder(service, "YT-MP3", None)

    assert folder_id == "folder-1"
    service.files.return_value.create.assert_not_called()


def test_ensure_drive_folder_creates_when_missing():
    service = MagicMock()
    files = service.files.return_value
    files.list.return_value.execute.return_value = {"files": []}
    files.create.return_value.execute.return_value = {"id": "created-1"}

    folder_id = main._ensure_drive_folder(service, "20260601_sports", "root-1")

    assert folder_id == "created-1"
    files.create.assert_called_once()
    body = files.create.call_args.kwargs["body"]
    assert body["name"] == "20260601_sports"
    assert body["parents"] == ["root-1"]


def test_run_drive_upload_batch_skips_existing_and_uploads_missing(tmp_path):
    directory = tmp_path / "20260601_sports"
    directory.mkdir()
    (directory / "01_existing.mp3").write_bytes(b"x")
    (directory / "02_new.mp3").write_bytes(b"y")
    service = MagicMock()
    files = service.files.return_value
    files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "leaf-id"}]},
        {"files": [{"name": "01_existing.mp3"}]},
    ]
    files.create.return_value.execute.return_value = {"id": "uploaded-id"}

    main.run_drive_upload_batch("task-1", directory, service, "YT-MP3")

    items = main.drive_upload_progress["task-1"]["items"]
    assert items["01_existing.mp3"]["status"] == "skipped"
    assert items["02_new.mp3"]["status"] == "done"
    upload_calls = [
        call for call in files.create.call_args_list
        if call.kwargs["body"].get("mimeType") != "application/vnd.google-apps.folder"
    ]
    assert len(upload_calls) == 1
    assert upload_calls[0].kwargs["body"]["name"] == "02_new.mp3"


async def test_post_drive_upload_validates_directory_under_output_path(client, tmp_path):
    out = tmp_path / "out"
    batch = out / "20260601_sports"
    batch.mkdir(parents=True)
    (batch / "01_song.mp3").write_bytes(b"x")

    with patch("main.load_settings", return_value={"output_path": str(out), "drive_root_folder": "YT-MP3"}), \
         patch("main.load_drive_credentials", return_value=MagicMock()), \
         patch("main.build") as mock_build, \
         patch("main.run_drive_upload_batch") as mock_run:
        mock_build.return_value = MagicMock()
        async with client as c:
            r = await c.post("/drive/upload", json={"directory": str(batch)})

    assert r.status_code == 200
    assert "task_id" in r.json()
    assert main.drive_upload_progress[r.json()["task_id"]]["items"]["01_song.mp3"]["status"] == "pending"
    assert mock_run.call_args.args[1] == batch.resolve()


async def test_post_drive_upload_rejects_directory_outside_output_path(client, tmp_path):
    out = tmp_path / "out"
    outside = tmp_path / "outside"
    outside.mkdir()
    with patch("main.load_settings", return_value={"output_path": str(out), "drive_root_folder": "YT-MP3"}):
        async with client as c:
            r = await c.post("/drive/upload", json={"directory": str(outside)})
    assert r.status_code == 400


async def test_drive_upload_progress_done_state(client):
    main.drive_upload_progress["done-id"] = {
        "status": "done",
        "items": {"01_song.mp3": {"filename": "01_song.mp3", "status": "done", "error": None}},
    }
    async with client as c:
        r = await c.get("/drive/upload/progress/done-id")
    assert r.status_code == 200
    data = json.loads([line for line in r.text.splitlines() if line.startswith("data:")][0][6:])
    assert data["status"] == "done"


async def test_get_drive_upload_folders_returns_502_on_api_error(client, tmp_path):
    with patch("main.load_settings", return_value={"output_path": str(tmp_path), "drive_root_folder": "YT-MP3"}), \
         patch("main._collect_upload_folders", side_effect=_api_disabled_error()):
        async with client as c:
            r = await c.get("/drive/upload/folders")
    assert r.status_code == 502
    assert "Drive API" in r.json()["detail"]


async def test_get_drive_upload_folders_marks_uploaded(client, tmp_path):
    out = tmp_path / "out"
    for name in ("20260601_sports", "20260601_evening"):
        d = out / name
        d.mkdir(parents=True)
        (d / "01_song.mp3").write_bytes(b"x")
    service = MagicMock()
    files = service.files.return_value
    files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "sports-id"}]},
        {"files": [{"name": "01_song.mp3"}]},
        {"files": []},
    ]
    with patch("main.load_settings", return_value={"output_path": str(out), "drive_root_folder": "YT-MP3"}), \
         patch("main.load_drive_credentials", return_value=MagicMock()), \
         patch("main.build", return_value=service):
        async with client as c:
            r = await c.get("/drive/upload/folders")
    assert r.status_code == 200
    by_name = {item["name"]: item for item in r.json()["folders"]}
    assert by_name["20260601_sports"]["uploaded"] is True
    assert by_name["20260601_evening"]["uploaded"] is False
