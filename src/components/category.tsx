import {
  BookOpen,
  Bike,
  Home,
  Package,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

// Mỗi danh mục một biểu tượng + dải màu, dùng làm ảnh đại diện tin khi chưa có ảnh thật.
const META: Record<string, { icon: LucideIcon; bg: string }> = {
  "Đồ gia dụng": { icon: Sofa, bg: "linear-gradient(135deg,#f97316,#b45309)" },
  "Điện tử": { icon: Smartphone, bg: "linear-gradient(135deg,#0ea5e9,#1d4ed8)" },
  "Xe cộ": { icon: Bike, bg: "linear-gradient(135deg,#ef4444,#7f1d1d)" },
  "Thời trang": { icon: Shirt, bg: "linear-gradient(135deg,#ec4899,#7e22ce)" },
  "Đồ ăn, thức uống": { icon: UtensilsCrossed, bg: "linear-gradient(135deg,#facc15,#c2410c)" },
  "Phòng, chỗ ở": { icon: Home, bg: "linear-gradient(135deg,#65a30d,#047857)" },
  "Sửa chữa": { icon: Wrench, bg: "linear-gradient(135deg,#64748b,#1e293b)" },
  "Dọn dẹp, giặt ủi": { icon: Sparkles, bg: "linear-gradient(135deg,#2dd4bf,#0f766e)" },
  "Học tập": { icon: BookOpen, bg: "linear-gradient(135deg,#818cf8,#3730a3)" },
  Khác: { icon: Package, bg: "linear-gradient(135deg,#334155,#0f172a)" },
};

export function categoryMeta(c: string) {
  return META[c] ?? META["Khác"]!;
}

/** Ô ảnh đại diện tin theo danh mục. */
export function CategoryTile({ category, className, iconClass }: { category: string; className?: string; iconClass?: string }) {
  const { icon: Icon, bg } = categoryMeta(category);
  return (
    <div className={cn("relative grid place-items-center overflow-hidden text-white", className)} style={{ background: bg }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgb(255_255_255/0.22),transparent_60%)]" />
      <Icon className={cn("relative size-10 drop-shadow", iconClass)} aria-hidden />
    </div>
  );
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const { icon: Icon } = categoryMeta(category);
  return <Icon className={cn("size-4", className)} aria-hidden />;
}
