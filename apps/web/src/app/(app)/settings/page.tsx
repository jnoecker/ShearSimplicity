import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { SettingsForm } from "./_components/settings-form";

interface SalonSettings {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

export default async function SettingsPage() {
  const settings = await apiFetch<SalonSettings>("/settings");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Salon profile and timezone. Business hours, branding, and integrations land later."
      />
      <Card>
        <SettingsForm
          defaults={{
            name: settings.name,
            timezone: settings.timezone,
            slug: settings.slug,
          }}
        />
      </Card>
    </div>
  );
}
