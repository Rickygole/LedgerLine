import type { Metadata } from "next";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { CONTROLS_STATEMENT, SECURITY_CONTROLS, type Provider } from "@/lib/lifecycle/security-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security controls" };

const PROVIDER_TONE: Record<Provider, Tone> = {
  Application: "ok",
  Shared: "warn",
  "Inherited from hosting provider": "info",
};

export default async function SecurityControlsPage() {
  await requireUser(FINANCE_ROLES);

  return (
    <>
      <PageHeader
        title="Security controls"
        description="The NIST SP 800-53 Rev. 5 controls this application implements, where each one lives in the code, and the test that proves it."
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Platform and delivery", href: "/finance/platform" },
          { label: "Security controls" },
        ]}
      />
      <div className="space-y-6">
        <p className="rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-sm font-semibold text-ink">
          {CONTROLS_STATEMENT}
        </p>
        <Card>
          <CardHeader
            title={`Controls mapped (${SECURITY_CONTROLS.length})`}
            description="The last column says who provides the control. Application means this code. Shared means the application and the hosting environment each provide part. Inherited from hosting provider means the application does not provide it."
          />
          <CardBody className="p-0">
            <Table density="compact">
              <THead>
                <tr>
                  <TH>Control</TH>
                  <TH>How LedgerLine meets it</TH>
                  <TH>Where it lives</TH>
                  <TH>Test that proves it</TH>
                  <TH>Provided by</TH>
                </tr>
              </THead>
              <tbody>
                {SECURITY_CONTROLS.map((control) => (
                  <TR key={control.id} className="align-top">
                    <TD className="whitespace-nowrap">
                      <span className="font-semibold">{control.id}</span>
                      <span className="block text-muted">{control.name}</span>
                    </TD>
                    <TD className="max-w-xl text-muted">{control.how}</TD>
                    <TD className="text-xs">
                      <ul className="space-y-1">
                        {control.where.map((path) => (
                          <li key={path} className="font-mono break-all">
                            {path}
                          </li>
                        ))}
                      </ul>
                    </TD>
                    <TD className="text-xs">
                      {control.tests.length > 0 ? (
                        <ul className="space-y-1">
                          {control.tests.map((path) => (
                            <li key={path} className="font-mono break-all">
                              {path}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">None in this application</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={PROVIDER_TONE[control.provider]}>{control.provider}</Badge>
                      {control.note ? <span className="mt-1 block text-xs text-muted">{control.note}</span> : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
