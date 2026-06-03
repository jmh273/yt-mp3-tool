import json
import threading
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
    upload_service = MagicMock()
    upload_files = upload_service.files.return_value
    upload_files.create.return_value.execute.return_value = {"id": "uploaded-id"}

    with patch("main._build_drive_service", return_value=upload_service):
        main.run_drive_upload_batch("task-1", directory, service, "YT-MP3")

    items = main.drive_upload_progress["task-1"]["items"]
    assert items["01_existing.mp3"]["status"] == "skipped"
    assert items["02_new.mp3"]["status"] == "done"
    upload_calls = [
        call for call in upload_files.create.call_args_list
        if call.kwargs["body"].get("mimeType") != "application/vnd.google-apps.folder"
    ]
    assert len(upload_calls) == 1
    assert upload_calls[0].kwargs["body"]["name"] == "02_new.mp3"


def test_run_drive_upload_batch_uploads_mp4_with_video_mimetype(tmp_path):
    directory = tmp_path / "20260601_sports"
    directory.mkdir()
    (directory / "01_song.mp3").write_bytes(b"x")
    (directory / "02_clip.mp4").write_bytes(b"y")
    service = MagicMock()
    files = service.files.return_value
    files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "leaf-id"}]},
        {"files": []},
    ]
    upload_service = MagicMock()
    upload_service.files.return_value.create.return_value.execute.return_value = {"id": "uploaded-id"}

    with patch("main._build_drive_service", return_value=upload_service), \
         patch("main.MediaFileUpload") as mock_media:
        main.run_drive_upload_batch("task-mp4", directory, service, "YT-MP3")

    uploaded_mimetypes = {
        Path(call.args[0]).name: call.kwargs["mimetype"]
        for call in mock_media.call_args_list
    }
    assert uploaded_mimetypes == {
        "01_song.mp3": "audio/mpeg",
        "02_clip.mp4": "video/mp4",
    }
    assert main.drive_upload_progress["task-mp4"]["items"]["02_clip.mp4"]["status"] == "done"


def test_run_drive_upload_batch_concurrent_respects_limit_and_uses_worker_services(tmp_path):
    directory = tmp_path / "20260601_sports"
    directory.mkdir()
    for i in range(6):
        (directory / f"{i:02d}_song.mp3").write_bytes(b"x")

    setup_service = MagicMock()
    setup_files = setup_service.files.return_value
    setup_files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "leaf-id"}]},
        {"files": []},
    ]

    in_flight = 0
    peak = 0
    lock = threading.Lock()
    release = threading.Event()
    started = threading.Semaphore(0)
    worker_services = []

    def execute_upload():
        nonlocal in_flight, peak
        with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        started.release()
        release.wait(timeout=5)
        with lock:
            in_flight -= 1
        return {"id": "uploaded-id"}

    def build_worker_service():
        service = MagicMock()
        service.files.return_value.create.return_value.execute.side_effect = execute_upload
        worker_services.append(service)
        return service

    with patch("main._build_drive_service", side_effect=build_worker_service), \
         patch("main.MediaFileUpload"):
        t = threading.Thread(
            target=main.run_drive_upload_batch,
            args=("task-concurrent", directory, setup_service, "YT-MP3"),
            kwargs={"concurrency": 3},
        )
        t.start()
        for _ in range(3):
            assert started.acquire(timeout=5)
        assert started.acquire(timeout=0.3) is False
        with lock:
            assert peak == 3
        release.set()
        t.join(timeout=5)

    assert peak == 3
    assert len(worker_services) == 6
    assert main.drive_upload_progress["task-concurrent"]["status"] == "done"
    assert all(item["status"] == "done" for item in main.drive_upload_progress["task-concurrent"]["items"].values())


def test_run_drive_upload_batch_concurrent_partial_failure_does_not_block_others(tmp_path):
    directory = tmp_path / "20260601_sports"
    directory.mkdir()
    for name in ("01_ok.mp3", "02_bad.mp3", "03_ok.mp3"):
        (directory / name).write_bytes(b"x")

    setup_service = MagicMock()
    setup_files = setup_service.files.return_value
    setup_files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "leaf-id"}]},
        {"files": []},
    ]

    def build_worker_service():
        service = MagicMock()

        def fake_create(**kwargs):
            if kwargs["body"]["name"] == "02_bad.mp3":
                raise RuntimeError("upload boom")
            result = MagicMock()
            result.execute.return_value = {"id": "uploaded-id"}
            return result

        service.files.return_value.create.side_effect = fake_create
        return service

    with patch("main._build_drive_service", side_effect=build_worker_service), \
         patch("main.MediaFileUpload"):
        main.run_drive_upload_batch("task-partial", directory, setup_service, "YT-MP3", concurrency=3)

    items = main.drive_upload_progress["task-partial"]["items"]
    assert items["01_ok.mp3"]["status"] == "done"
    assert items["02_bad.mp3"]["status"] == "error"
    assert "upload boom" in items["02_bad.mp3"]["error"]
    assert items["03_ok.mp3"]["status"] == "done"
    assert main.drive_upload_progress["task-partial"]["status"] == "done"


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


async def test_post_drive_upload_passes_resolved_concurrency(client, tmp_path):
    out = tmp_path / "out"
    batch = out / "20260601_sports"
    batch.mkdir(parents=True)
    (batch / "01_song.mp3").write_bytes(b"x")

    with patch(
        "main.load_settings",
        return_value={"output_path": str(out), "drive_root_folder": "YT-MP3", "drive_upload_concurrency": 4},
    ), patch("main.load_drive_credentials", return_value=MagicMock()), \
         patch("main.build") as mock_build, \
         patch("main.run_drive_upload_batch") as mock_run:
        mock_build.return_value = MagicMock()
        async with client as c:
            r = await c.post("/drive/upload", json={"directory": str(batch)})

    assert r.status_code == 200
    assert mock_run.call_args.args[-1] == 4


async def test_post_drive_upload_includes_mp4_items(client, tmp_path):
    out = tmp_path / "out"
    batch = out / "20260601_sports"
    batch.mkdir(parents=True)
    (batch / "01_song.mp3").write_bytes(b"x")
    (batch / "02_clip.mp4").write_bytes(b"y")

    with patch("main.load_settings", return_value={"output_path": str(out), "drive_root_folder": "YT-MP3"}), \
         patch("main.load_drive_credentials", return_value=MagicMock()), \
         patch("main.build") as mock_build, \
         patch("main.run_drive_upload_batch"):
        mock_build.return_value = MagicMock()
        async with client as c:
            r = await c.post("/drive/upload", json={"directory": str(batch)})

    assert r.status_code == 200
    items = main.drive_upload_progress[r.json()["task_id"]]["items"]
    assert set(items) == {"01_song.mp3", "02_clip.mp4"}


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


async def test_get_drive_upload_folders_marks_mp4_folder_uploaded(client, tmp_path):
    out = tmp_path / "out"
    folder = out / "20260601_video"
    folder.mkdir(parents=True)
    (folder / "01_clip.mp4").write_bytes(b"x")
    service = MagicMock()
    files = service.files.return_value
    files.list.return_value.execute.side_effect = [
        {"files": [{"id": "root-id"}]},
        {"files": [{"id": "video-id"}]},
        {"files": [{"name": "01_clip.mp4"}]},
    ]
    with patch("main.load_settings", return_value={"output_path": str(out), "drive_root_folder": "YT-MP3"}), \
         patch("main.load_drive_credentials", return_value=MagicMock()), \
         patch("main.build", return_value=service):
        async with client as c:
            r = await c.get("/drive/upload/folders")

    assert r.status_code == 200
    assert r.json()["folders"][0]["uploaded"] is True
