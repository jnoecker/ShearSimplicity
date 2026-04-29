import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { SettingsForm } from "./_components/settings-form";

interface SalonSettings {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  smsFromNumber: string | null;
}

export default async function SettingsPage() {
  const settings = await apiFetch<SalonSettings>("/settings");
  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Settings"
        description="Salon profile and timezone. Business hours, branding, and integrations land later."
      />
      <Card title="Studio profile" meta="Public">
        <SettingsForm
          defaults={{
            name: settings.name,
            timezone: settings.timezone,
            slug: settings.slug,
            smsFromNumber: settings.smsFromNumber ?? "",
          }}
        />
      </Card>
    </>
  );
}
