import { AdminConsole } from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "ADMIN", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminConsole />;
}
