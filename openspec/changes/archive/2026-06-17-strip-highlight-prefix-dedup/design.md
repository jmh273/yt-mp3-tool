## Context

「是否已下載」的比對目前散落在兩處，但邏輯一致：把候選影片標題經 `_sanitize_filename()` 得到 stem，再與磁碟上既有檔名的 stem（去掉 `^\d+_` 序號前綴）比對：

- `_today_downloaded_stems()`（main.py:2249）→ 供 `downloaded_today` 旗標使用（main.py:2057）。
- `_downloaded_stems_all()`（main.py:1233）→ 供 discovery 過濾使用（main.py:1687-1688）。

`_sanitize_filename()`（main.py:174）會把標題開頭的全形括號 `【】` 換成 `_`，再 collapse `_+` 並 `strip(" ._")`。因此 `【精華】My Talk` 會被清成 `精華_My Talk`：開頭 `【` → `_` 被 strip，`】` → `_`，得到 `精華_My Talk`。這使得「精華版重新上架」的影片無法與既有 `My Talk` 對上，重複出現／重複下載。

## Goals / Non-Goals

**Goals:**
- 在比對 key 上正規化掉開頭的 `【精華】` 標記，讓 `【精華】xxx` 與 `xxx` 互判為同一支。
- 對稱套用：候選標題 stem 與磁碟既有 stem 兩側都正規化，雙向皆能對上。
- 兩處比對（latest-videos-feed、similar-channel-discovery）共用同一份正規化邏輯。

**Non-Goals:**
- 不改變實際下載檔名：下載仍以原始 `【精華】` 標題經 `_sanitize_filename` 命名。
- 不處理其他 re-upload 標記（如 `【完整版】`、`【Full】` 等）——本次僅針對 `【精華】`。
- 不動 URL preview / trending 的 `video_id` 為基礎之 session 去重（不受此問題影響）。
- 不動 Drive 上傳的同名比對（以原始檔名比對，維持現狀）。

## Decisions

### 決策 1：在「sanitized stem」上正規化，而非原始標題

比對的一側是磁碟既有檔名 stem，已經是 sanitize 過的形態、無法還原原始標題。為了讓兩側可比，正規化必須定義在 **sanitized stem** 的形態上，而非原始標題。

`【精華】` 經 `_sanitize_filename` 後在 stem 開頭呈現為 `精華` + 一個分隔符（通常 `_`，因 `】`→`_`）。因此正規化規則：

```python
import re
_HIGHLIGHT_PREFIX_RE = re.compile(r"^精華[ _]?")

def _strip_highlight_prefix(stem: str) -> str:
    """移除 sanitized stem 開頭、由 `【精華】` 清洗而來的 `精華` 標記（含後隨分隔符）。
    僅作用於開頭；標題中間出現的「精華」不受影響。"""
    return _HIGHLIGHT_PREFIX_RE.sub("", stem, count=1)
```

**Alternatives considered:**
- 在原始標題上用 `re.sub(r"^【精華】\s*", "", title)` 再 sanitize：只能正規化候選標題側，磁碟既有 stem 那側無法套用（拿不到原始標題），會變成單向比對，無法處理「磁碟上是 `精華_xxx`、候選是 `xxx`」的反向情況。否決。

### 決策 2：對稱套用於兩側

在 `_today_downloaded_stems()` / `_downloaded_stems_all()` 建立 set 時，對每個 stem 套 `_strip_highlight_prefix`；在計算候選 key（`_sanitize_filename(title)`）後也套同一函式，再做 `in` 比對。雙向一致。

實作上把現有的 `_sanitize_filename(title)` 比對改為 `_strip_highlight_prefix(_sanitize_filename(title))`，set 內元素也先正規化。

### 決策 3：只移除開頭單一 `精華` token，不碰中間

用 `^` 錨定 + `count=1`，確保 `年度精華回顧`、`2025 精華回顧` 這類中間含「精華」的標題不被誤改。分隔符以 `[ _]?` 容忍 `精華_xxx` 與 `精華 xxx` 兩種清洗結果。

## Risks / Trade-offs

- **[誤判合併]** 兩支真的不同、但其中一支標題剛好是另一支加 `【精華】` 前綴的影片，會被視為同一支 → 影響極小，且正是使用者要的行為（精華版＝已有原版即不重複下載）。可接受。
- **[只認 `精華` 字面]** 若標題用 `【精華版】` 或英文 `[Highlights]`，不會被正規化 → Non-Goal，未來可擴充 regex。維持本次範圍精簡。
- **[set 內碰撞]** 正規化後不同 stem 可能塌成同一 key（例如同時有 `精華_A` 與 `A`）→ 對「已下載」判定無害（仍視為已下載），不影響下載命名。可接受。

## Migration Plan

純後端比對邏輯調整，無資料遷移、無 API 形狀變更。部署即生效；回滾即還原 `_strip_highlight_prefix` 的呼叫即可。
