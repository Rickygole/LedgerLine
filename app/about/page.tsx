import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { CreditFooter, SyntheticBanner } from "@/components/shell/synthetic-banner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About this proof of concept" };

const ROLES = [
  { name: "Reporting organization", text: "Staff at a funded nonprofit. They see only their own organization, start and edit reports for their initiatives, and submit them. Colleagues at the same organization share one history." },
  { name: "Finance (view only)", text: "Council Finance staff who can read every report, dashboard, and audit entry but cannot change anything." },
  { name: "Finance analyst", text: "Reviews submitted reports, starts a review, asks the organization for an update, and accepts reports. Can also correct an answer with a recorded reason." },
  { name: "Finance administrator", text: "Everything an analyst can do, plus managing initiatives, reporting forms, and who can sign in." },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SyntheticBanner />
      <header className="on-dark border-b border-line bg-navy-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo subtitle="Initiative Reporting System" />
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 focus:outline-none sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">About this proof of concept</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
          LedgerLine is a working prototype of a system where organizations funded through New York City Council initiatives report on how they used their money, and where Council Finance reviews those reports in one place.
        </p>

        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader title="What it does" />
            <CardBody className="space-y-3 text-sm leading-6 text-ink">
              <p>Each funded organization signs in, sees the reports it owes for each initiative and reporting period, fills in a form, enters a budget that must balance to its award, attaches documents, and submits. A confirmation message is recorded when it does.</p>
              <p>Council Finance sees every report across all organizations, can tell at a glance which are missing, late, or waiting for review, and can ask an organization to update a report or accept it. Every change is written to an audit trail that cannot be edited.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="All data is synthetic" />
            <CardBody className="space-y-3 text-sm leading-6 text-ink">
              <p>Every organization, person, EIN, award, and report in this prototype is invented for the demonstration. Nothing here comes from NYC Council records, and names that resemble real organizations are coincidence. Email addresses end in example domains and no real email is sent. Messages that would be emailed are shown inside the portal instead.</p>
              <p>This is not an official New York City system and is not affiliated with the Council.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The request it responds to" />
            <CardBody className="space-y-3 text-sm leading-6 text-ink">
              <p>
                The prototype responds to the City Council&apos;s request for proposals for an Initiative Reporting System, procurement identifier <span className="font-mono">PIN 102202709162026</span>.
              </p>
              <p>In plain terms, the Council wants a replacement for the spreadsheets and email threads it uses today to collect progress reports from organizations that receive discretionary funding. The system should let Council Finance define reporting forms that change each fiscal year, let organizations complete them online with checks that catch mistakes before submission, give staff a clear view of what is outstanding, and keep a trustworthy record of who did what and when.</p>
              <p>
                The <Link href="/trust" className="text-navy-800 underline">requirements evidence page</Link> maps each of those expectations to something you can try in this prototype.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="How roles work" description="What a person can see and do depends on the role on their account." />
            <CardBody>
              <dl className="space-y-4">
                {ROLES.map((role) => (
                  <div key={role.name}>
                    <dt className="text-sm font-semibold text-ink">{role.name}</dt>
                    <dd className="mt-0.5 text-sm leading-6 text-muted">{role.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm leading-6 text-ink">These limits are enforced in the database itself, not only in the screens, so one organization cannot read another organization&apos;s reports even by changing a link.</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Sign in with one of the demonstration accounts to try it.</p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/trust" variant="secondary">
                  Requirements evidence
                </ButtonLink>
                <ButtonLink href="/login">Sign in to the demo</ButtonLink>
              </div>
            </CardBody>
          </Card>
        </div>
      </main>
      <CreditFooter />
    </div>
  );
}
