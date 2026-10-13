# phung-os — Bộ não & khung điều phối dùng chung

Nguồn chuẩn (canonical) cho quy trình, quy tắc, skills và template dùng lại giữa các dự án độc
lập (racehub, yehship, khuminh, …). Mỗi dự án TỰ CHỨA: giữ một bản sao (vendored) trong
`.phung-os/` + skills ở `.claude/skills/` gốc, và ghi `PHUNG_OS_VERSION`. Clone một mình repo
dự án là đủ để build và đóng gói — không phụ thuộc submodule, không phụ thuộc repo này lúc chạy.

Phân định kho: **Git giữ mọi thứ về code; Google Drive giữ mọi thứ kinh doanh.** Chỉ trỏ link.

Cập nhật vào một dự án: `./scripts/sync-into-project.sh /duong-dan/repo-du-an`.
CI của dự án có job kiểm `PHUNG_OS_VERSION` khớp bản đã pin (chống trôi).
