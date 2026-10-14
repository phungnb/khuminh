import { SearchX } from "lucide-react";
import Link from "next/link";
import { AuthShell, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <AuthShell>
      <EmptyState
        icon={SearchX}
        title="Không tìm thấy trang"
        description="Trang này không tồn tại, đã bị gỡ hoặc bạn không có quyền xem."
        action={<Link className="btn" href="/app">Về chợ</Link>}
      />
    </AuthShell>
  );
}
