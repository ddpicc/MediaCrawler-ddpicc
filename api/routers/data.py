# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/api/routers/data.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#
# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

import os
import json
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/data", tags=["data"])

# Data directory
DATA_DIR = Path(__file__).parent.parent.parent / "data"


def _to_int(value, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except Exception:
        return default


def _split_images(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _normalize_xhs_note(item: dict) -> dict:
    image_urls = _split_images(item.get("image_list"))
    return {
        "note_id": str(item.get("note_id", "")),
        "title": item.get("title", "") or "",
        "desc": item.get("desc", "") or "",
        "nickname": item.get("nickname", "") or "",
        "avatar": item.get("avatar", "") or "",
        "liked_count": _to_int(item.get("liked_count")),
        "collected_count": _to_int(item.get("collected_count")),
        "comment_count": _to_int(item.get("comment_count")),
        "share_count": _to_int(item.get("share_count")),
        "time": _to_int(item.get("time")),
        "note_url": item.get("note_url", "") or "",
        "source_keyword": item.get("source_keyword", "") or "",
        "type": item.get("type", "") or "",
        "video_url": item.get("video_url", "") or "",
        "image_urls": image_urls,
        "cover": image_urls[0] if image_urls else "",
    }


def _load_search_contents_from_file(file_path: Path) -> list[dict]:
    suffix = file_path.suffix.lower()
    records: list[dict] = []

    if suffix == ".json":
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                records = [data]
    elif suffix == ".jsonl":
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except Exception:
                    continue
    elif suffix == ".csv":
        import csv

        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            records = list(reader)
    else:
        return []

    return [_normalize_xhs_note(item) for item in records if isinstance(item, dict)]


def _find_latest_search_contents_file() -> Optional[Path]:
    if not DATA_DIR.exists():
        return None

    candidates: list[Path] = []
    for root, _, filenames in os.walk(DATA_DIR):
        root_path = Path(root)
        for filename in filenames:
            file_path = root_path / filename
            rel = str(file_path.relative_to(DATA_DIR)).lower()
            if "xhs" not in rel:
                continue
            if "search_contents" not in file_path.name.lower():
                continue
            if file_path.suffix.lower() not in {".json", ".jsonl", ".csv"}:
                continue
            candidates.append(file_path)

    if not candidates:
        return None

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def _extract_run_token(name: str, prefix: str) -> Optional[str]:
    lower = name.lower()
    ext = Path(name).suffix.lower()
    if not lower.startswith(prefix) or ext not in {".json", ".jsonl", ".csv"}:
        return None
    return name[len(prefix): -len(ext)]


def _find_matching_search_comments_file(contents_file: Path) -> Optional[Path]:
    token = _extract_run_token(contents_file.name, "search_contents_")
    if not token:
        return None

    # Prefer same directory and same extension first
    ext = contents_file.suffix.lower()
    direct = contents_file.parent / f"search_comments_{token}{ext}"
    if direct.exists() and direct.is_file():
        return direct

    # Fallback to any supported extension in same directory
    for suffix in (".json", ".jsonl", ".csv"):
        candidate = contents_file.parent / f"search_comments_{token}{suffix}"
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def _load_search_comments_from_file(file_path: Path) -> list[dict]:
    suffix = file_path.suffix.lower()
    records: list[dict] = []

    if suffix == ".json":
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                records = [data]
    elif suffix == ".jsonl":
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except Exception:
                    continue
    elif suffix == ".csv":
        import csv

        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            records = list(reader)
    else:
        return []

    normalized: list[dict] = []
    for item in records:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "comment_id": str(item.get("comment_id", "")),
                "note_id": str(item.get("note_id", "")),
                "content": item.get("content", "") or "",
                "nickname": item.get("nickname", "") or "",
                "avatar": item.get("avatar", "") or "",
                "like_count": _to_int(item.get("like_count")),
                "sub_comment_count": _to_int(item.get("sub_comment_count")),
                "create_time": _to_int(item.get("create_time")),
                "ip_location": item.get("ip_location", "") or "",
                "parent_comment_id": str(item.get("parent_comment_id", "")),
            }
        )
    return normalized


def get_file_info(file_path: Path) -> dict:
    """Get file information"""
    stat = file_path.stat()
    record_count = None

    # Try to get record count
    try:
        if file_path.suffix == ".json":
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    record_count = len(data)
        elif file_path.suffix == ".csv":
            with open(file_path, "r", encoding="utf-8") as f:
                record_count = sum(1 for _ in f) - 1  # Subtract header row
    except Exception:
        pass

    return {
        "name": file_path.name,
        "path": str(file_path.relative_to(DATA_DIR)),
        "size": stat.st_size,
        "modified_at": stat.st_mtime,
        "record_count": record_count,
        "type": file_path.suffix[1:] if file_path.suffix else "unknown"
    }


@router.get("/files")
async def list_data_files(platform: Optional[str] = None, file_type: Optional[str] = None):
    """Get data file list"""
    if not DATA_DIR.exists():
        return {"files": []}

    files = []
    supported_extensions = {".json", ".csv", ".xlsx", ".xls"}

    for root, dirs, filenames in os.walk(DATA_DIR):
        root_path = Path(root)
        for filename in filenames:
            file_path = root_path / filename
            if file_path.suffix.lower() not in supported_extensions:
                continue

            # Platform filter
            if platform:
                rel_path = str(file_path.relative_to(DATA_DIR))
                if platform.lower() not in rel_path.lower():
                    continue

            # Type filter
            if file_type and file_path.suffix[1:].lower() != file_type.lower():
                continue

            try:
                files.append(get_file_info(file_path))
            except Exception:
                continue

    # Sort by modification time (newest first)
    files.sort(key=lambda x: x["modified_at"], reverse=True)

    return {"files": files}


@router.get("/files/{file_path:path}")
async def get_file_content(file_path: str, preview: bool = True, limit: int = 100):
    """Get file content or preview"""
    full_path = DATA_DIR / file_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    # Security check: ensure within DATA_DIR
    try:
        full_path.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    if preview:
        # Return preview data
        try:
            if full_path.suffix == ".json":
                with open(full_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return {"data": data[:limit], "total": len(data)}
                    return {"data": data, "total": 1}
            elif full_path.suffix == ".csv":
                import csv
                with open(full_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    rows = []
                    for i, row in enumerate(reader):
                        if i >= limit:
                            break
                        rows.append(row)
                    # Re-read to get total count
                    f.seek(0)
                    total = sum(1 for _ in f) - 1
                    return {"data": rows, "total": total}
            elif full_path.suffix.lower() in (".xlsx", ".xls"):
                import pandas as pd
                # Read first limit rows
                df = pd.read_excel(full_path, nrows=limit)
                # Get total row count (only read first column to save memory)
                df_count = pd.read_excel(full_path, usecols=[0])
                total = len(df_count)
                # Convert to list of dictionaries, handle NaN values
                rows = df.where(pd.notnull(df), None).to_dict(orient='records')
                return {
                    "data": rows,
                    "total": total,
                    "columns": list(df.columns)
                }
            else:
                raise HTTPException(status_code=400, detail="Unsupported file type for preview")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Return file download
        return FileResponse(
            path=full_path,
            filename=full_path.name,
            media_type="application/octet-stream"
        )


@router.get("/download/{file_path:path}")
async def download_file(file_path: str):
    """Download file"""
    full_path = DATA_DIR / file_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    # Security check
    try:
        full_path.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(
        path=full_path,
        filename=full_path.name,
        media_type="application/octet-stream"
    )


@router.get("/stats")
async def get_data_stats():
    """Get data statistics"""
    if not DATA_DIR.exists():
        return {"total_files": 0, "total_size": 0, "by_platform": {}, "by_type": {}}

    stats = {
        "total_files": 0,
        "total_size": 0,
        "by_platform": {},
        "by_type": {}
    }

    supported_extensions = {".json", ".csv", ".xlsx", ".xls"}

    for root, dirs, filenames in os.walk(DATA_DIR):
        root_path = Path(root)
        for filename in filenames:
            file_path = root_path / filename
            if file_path.suffix.lower() not in supported_extensions:
                continue

            try:
                stat = file_path.stat()
                stats["total_files"] += 1
                stats["total_size"] += stat.st_size

                # Statistics by type
                file_type = file_path.suffix[1:].lower()
                stats["by_type"][file_type] = stats["by_type"].get(file_type, 0) + 1

                # Statistics by platform (inferred from path)
                rel_path = str(file_path.relative_to(DATA_DIR))
                for platform in ["xhs", "dy", "ks", "bili", "wb", "tieba", "zhihu"]:
                    if platform in rel_path.lower():
                        stats["by_platform"][platform] = stats["by_platform"].get(platform, 0) + 1
                        break
            except Exception:
                continue

    return stats


@router.get("/search_contents")
async def get_search_contents(file_path: Optional[str] = None, limit: int = 200):
    """Get normalized xhs search contents for board page."""
    target_file: Optional[Path] = None

    if file_path:
        candidate = DATA_DIR / file_path
        if not candidate.exists() or not candidate.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        try:
            candidate.resolve().relative_to(DATA_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied")
        target_file = candidate
    else:
        target_file = _find_latest_search_contents_file()
        if target_file is None:
            return {"items": [], "total": 0, "source_file": None, "generated_at": datetime.now().isoformat()}

    items = _load_search_contents_from_file(target_file)
    items.sort(key=lambda x: x.get("time", 0), reverse=True)

    safe_limit = max(1, min(limit, 1000))
    comments_file = _find_matching_search_comments_file(target_file)
    return {
        "items": items[:safe_limit],
        "total": len(items),
        "source_file": str(target_file.relative_to(DATA_DIR)),
        "comments_file": str(comments_file.relative_to(DATA_DIR)) if comments_file else None,
        "generated_at": datetime.now().isoformat(),
    }


@router.get("/search_comments")
async def get_search_comments(contents_file_path: str, note_id: str, limit: int = 300):
    """Get note comments for board detail pane."""
    if not contents_file_path:
        raise HTTPException(status_code=400, detail="contents_file_path is required")
    if not note_id:
        raise HTTPException(status_code=400, detail="note_id is required")

    contents_file = DATA_DIR / contents_file_path
    if not contents_file.exists() or not contents_file.is_file():
        raise HTTPException(status_code=404, detail="Contents file not found")
    try:
        contents_file.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    comments_file = _find_matching_search_comments_file(contents_file)
    if comments_file is None:
        return {"items": [], "total": 0, "source_file": None}

    comments = _load_search_comments_from_file(comments_file)
    filtered = [it for it in comments if str(it.get("note_id", "")) == str(note_id)]
    filtered.sort(key=lambda x: x.get("create_time", 0), reverse=True)

    safe_limit = max(1, min(limit, 1000))
    return {
        "items": filtered[:safe_limit],
        "total": len(filtered),
        "source_file": str(comments_file.relative_to(DATA_DIR)),
    }
