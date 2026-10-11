import { Fragment } from "react";
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
            <Table density="compact" stack tableClassName="md:table-fixed">
              <colgroup className="max-md:hidden">
                <col className="w-[15%]" />
                <col className="w-[37%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <THead>
                <tr>
                  <TH className="whitespace-normal">Control</TH>
                  <TH className="whitespace-normal">How LedgerLine meets it</TH>
                  <TH className="whitespace-normal">Where it lives</TH>
                  <TH className="whitespace-normal">Test that proves it</TH>
                  <TH className="whitespace-normal">Provided by</TH>
                </tr>
              </THead>
              <tbody>
                {SECURITY_CONTROLS.map((control) => (
                  <TR key={control.id}>
                    <TD className="align-top" primary>
                      <span className="block whitespace-nowrap font-semibold">{control.id}</span>
                      <span className="block font-normal text-muted">{control.name}</span>
                    </TD>
                    <TD className="align-top text-muted">{control.how}</TD>
                    <TD className="stack-start align-top text-xs" label="Where it lives">
                      <PathList paths={control.where} />
                    </TD>
                    <TD className="stack-start align-top text-xs" label="Test that proves it">
                      {control.tests.length > 0 ? (
                        <PathList paths={control.tests} />
                      ) : (
                        <span className="text-[13px] text-muted">Provided by the hosting platform</span>
                      )}
                    </TD>
                    <TD className="align-top" label="Provided by">
                      <span>
                        <Badge tone={PROVIDER_TONE[control.provider]} className="whitespace-normal">
                          {control.provider}
                        </Badge>
                        {control.note ? (
                          <span className="mt-1 block text-[13px] leading-5 text-muted">{control.note}</span>
                        ) : null}
                      </span>
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

function PathList({ paths }: { paths: string[] }) {
  return (
    <ul className="space-y-1">
      {paths.map((path) => (
        <li key={path} className="font-mono break-normal">
          {path.split("/").map((part, i, parts) => (
            <Fragment key={i}>
              {part}
              {i < parts.length - 1 ? (
                <>
                  /<wbr />
                </>
              ) : null}
            </Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}
