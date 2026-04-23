#!/usr/bin/env python3
"""
One-time runtime data cleanup for GazeConnect.

What it does:
1) Optionally archives files that will be removed.
2) Prunes survey snapshots/session files with retention caps.
3) Prunes old session folders.
4) Prunes spoken chat logs by age and count.
5) Writes a JSON report with before/after stats.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Set, Tuple


@dataclass
class DirStats:
    file_count: int
    bytes_total: int


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def bytes_human(num: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    val = float(num)
    for unit in units:
        if val < 1024.0 or unit == units[-1]:
            return f"{val:.2f} {unit}"
        val /= 1024.0
    return f"{num} B"


def all_files(root: Path) -> List[Path]:
    if not root.exists():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


def dir_stats(root: Path) -> DirStats:
    files = all_files(root)
    return DirStats(file_count=len(files), bytes_total=sum(p.stat().st_size for p in files))


def newest_first(paths: Iterable[Path]) -> List[Path]:
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)


def schedule_prune_by_count(directory: Path, keep: int) -> List[Path]:
    if keep < 0 or not directory.exists():
        return []
    files = newest_first([p for p in directory.glob("*") if p.is_file()])
    return files[keep:]


def schedule_spoken_log_prune(chat_dir: Path, keep_days: int, keep_max_files: int) -> List[Path]:
    if not chat_dir.exists():
        return []
    spoken = newest_first(list(chat_dir.glob("spoken_*.log")))
    if not spoken:
        return []

    if keep_days <= 0 and keep_max_files <= 0:
        return spoken

    cutoff = dt.datetime.now() - dt.timedelta(days=max(1, keep_days))
    keep_set: Set[Path] = set()

    for p in spoken:
        mtime = dt.datetime.fromtimestamp(p.stat().st_mtime)
        if mtime >= cutoff:
            keep_set.add(p)

    # Also keep newest N even if older than cutoff.
    for p in spoken[: max(0, keep_max_files)]:
        keep_set.add(p)

    return [p for p in spoken if p not in keep_set]


def schedule_keyboard_chat_prune(chat_dir: Path, keep_max_files: int) -> List[Path]:
    if not chat_dir.exists():
        return []
    chat_files = newest_first(list(chat_dir.glob("chat_*.txt")))
    keep = max(0, keep_max_files)
    return chat_files[keep:]


def schedule_survey_prune(
    survey_dir: Path,
    keep_sessions: int,
    keep_session_files: int,
    keep_snapshots: int,
) -> Tuple[List[Path], List[Path]]:
    files_to_delete: List[Path] = []
    dirs_to_delete: List[Path] = []

    sessions_root = survey_dir / "sessions"
    snapshots_dir = survey_dir / "survey_snapshots"

    # Snapshot file cap.
    files_to_delete.extend(schedule_prune_by_count(snapshots_dir, keep_snapshots))

    # Session directories.
    if sessions_root.exists():
        session_dirs = newest_first([p for p in sessions_root.glob("*") if p.is_dir()])
        keep_dirs = session_dirs[: max(0, keep_sessions)]
        drop_dirs = session_dirs[max(0, keep_sessions):]

        for d in keep_dirs:
            files_to_delete.extend(schedule_prune_by_count(d, keep_session_files))

        for d in drop_dirs:
            files_to_delete.extend(all_files(d))
            dirs_to_delete.append(d)

    return files_to_delete, dirs_to_delete


def archive_files(zip_path: Path, files: List[Path], base: Path) -> int:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    archived = 0
    with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in files:
            if not p.exists() or not p.is_file():
                continue
            try:
                arc = p.relative_to(base)
            except ValueError:
                arc = Path("external") / p.name
            zf.write(p, arcname=str(arc))
            archived += 1
    return archived


def remove_files(paths: List[Path]) -> int:
    deleted = 0
    for p in paths:
        if not p.exists() or not p.is_file():
            continue
        try:
            p.unlink()
            deleted += 1
        except OSError:
            pass
    return deleted


def remove_dirs(paths: List[Path]) -> int:
    deleted = 0
    # Delete deepest first.
    for p in sorted(paths, key=lambda d: len(str(d)), reverse=True):
        if not p.exists() or not p.is_dir():
            continue
        try:
            # Remove remaining files if any.
            for child in sorted(p.rglob("*"), key=lambda d: len(str(d)), reverse=True):
                if child.is_file():
                    child.unlink(missing_ok=True)
                elif child.is_dir():
                    try:
                        child.rmdir()
                    except OSError:
                        pass
            p.rmdir()
            deleted += 1
        except OSError:
            pass
    return deleted


def default_chat_dir(project_root: Path) -> Path:
    # Prefer data/chat_history (new runtime path). Fall back to legacy chat_history.
    modern = project_root / "data" / "chat_history"
    legacy = project_root / "chat_history"
    if modern.exists():
        try:
            if any(modern.iterdir()):
                return modern
            if legacy.exists():
                return legacy
        except OSError:
            pass
        return modern
    return legacy


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup runtime survey/chat data safely.")
    parser.add_argument("--project-root", default=".", help="Project root path")
    parser.add_argument("--survey-dir", default="survey_data", help="Survey data directory (relative to project root)")
    parser.add_argument("--chat-dir", default=None, help="Chat history directory (relative to project root)")
    parser.add_argument("--keep-sessions", type=int, default=2, help="Keep newest session folders")
    parser.add_argument("--keep-session-files", type=int, default=120, help="Keep newest files per kept session folder")
    parser.add_argument("--keep-snapshots", type=int, default=3, help="Keep newest survey snapshot files (set 0 to disable global snapshots)")
    parser.add_argument("--keyboard-chat-keep-files", type=int, default=5, help="Keep newest keyboard chat files (chat_*.txt)")
    parser.add_argument("--spoken-keep-days", type=int, default=0, help="Retain spoken logs for this many days (0 disables retention and removes all spoken logs)")
    parser.add_argument("--spoken-keep-files", type=int, default=0, help="Always keep this many newest spoken logs")
    parser.add_argument("--archive", action="store_true", help="Archive files scheduled for deletion before cleanup")
    parser.add_argument("--apply", action="store_true", help="Apply deletions (default is dry-run)")
    parser.add_argument("--report-dir", default="tools/reports", help="Directory for cleanup report")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    survey_dir = (project_root / args.survey_dir).resolve()
    chat_dir = (project_root / args.chat_dir).resolve() if args.chat_dir else default_chat_dir(project_root).resolve()
    report_dir = (project_root / args.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)

    before_survey = dir_stats(survey_dir)
    before_chat = dir_stats(chat_dir)

    survey_files, survey_dirs = schedule_survey_prune(
        survey_dir,
        keep_sessions=args.keep_sessions,
        keep_session_files=args.keep_session_files,
        keep_snapshots=args.keep_snapshots,
    )
    chat_files = schedule_spoken_log_prune(
        chat_dir,
        keep_days=args.spoken_keep_days,
        keep_max_files=args.spoken_keep_files,
    )
    chat_files += schedule_keyboard_chat_prune(
        chat_dir,
        keep_max_files=args.keyboard_chat_keep_files,
    )

    delete_files = newest_first(list({*survey_files, *chat_files}))
    delete_dirs = sorted(list({*survey_dirs}), key=lambda d: str(d))
    delete_bytes = sum(p.stat().st_size for p in delete_files if p.exists())

    archive_path = None
    archived_count = 0
    if args.archive and delete_files:
        archive_path = report_dir / f"cleanup_archive_{now_stamp()}.zip"
        archived_count = archive_files(archive_path, delete_files, project_root)

    deleted_files = 0
    deleted_dirs = 0
    if args.apply:
        deleted_files = remove_files(delete_files)
        deleted_dirs = remove_dirs(delete_dirs)

    after_survey = dir_stats(survey_dir)
    after_chat = dir_stats(chat_dir)

    report = {
        "timestamp": dt.datetime.now().isoformat(),
        "project_root": str(project_root),
        "mode": "apply" if args.apply else "dry-run",
        "survey_dir": str(survey_dir),
        "chat_dir": str(chat_dir),
        "before": {
            "survey": before_survey.__dict__,
            "chat": before_chat.__dict__,
        },
        "scheduled": {
            "delete_files": len(delete_files),
            "delete_dirs": len(delete_dirs),
            "delete_bytes": delete_bytes,
            "delete_bytes_human": bytes_human(delete_bytes),
        },
        "archive": {
            "enabled": bool(args.archive),
            "path": str(archive_path) if archive_path else None,
            "archived_files": archived_count,
        },
        "applied": {
            "deleted_files": deleted_files,
            "deleted_dirs": deleted_dirs,
        },
        "after": {
            "survey": after_survey.__dict__,
            "chat": after_chat.__dict__,
        },
        "retention": {
            "keep_sessions": args.keep_sessions,
            "keep_session_files": args.keep_session_files,
            "keep_snapshots": args.keep_snapshots,
            "keyboard_chat_keep_files": args.keyboard_chat_keep_files,
            "spoken_keep_days": args.spoken_keep_days,
            "spoken_keep_files": args.spoken_keep_files,
        },
    }

    report_path = report_dir / f"cleanup_report_{now_stamp()}.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Mode: {report['mode']}")
    print(f"Survey before: {before_survey.file_count} files, {bytes_human(before_survey.bytes_total)}")
    print(f"Chat before: {before_chat.file_count} files, {bytes_human(before_chat.bytes_total)}")
    print(f"Scheduled delete: {len(delete_files)} files + {len(delete_dirs)} dirs, {bytes_human(delete_bytes)}")
    if archive_path:
        print(f"Archive: {archive_path} ({archived_count} files)")
    if args.apply:
        print(f"Deleted: {deleted_files} files, {deleted_dirs} dirs")
        print(f"Survey after: {after_survey.file_count} files, {bytes_human(after_survey.bytes_total)}")
        print(f"Chat after: {after_chat.file_count} files, {bytes_human(after_chat.bytes_total)}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
