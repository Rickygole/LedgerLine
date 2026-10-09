import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/shell/info-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" updated="October 9, 2026" intro={<p>This page explains what information LedgerLine keeps, why it is kept and who can see it.</p>}>
      <h2 id="what-we-keep">What we keep</h2>
      <h3>Your account</h3>
      <p>Your name, work email address, job title, role and, for funded organizations, the organization you report for. Council Finance creates accounts. Passwords are stored only as a one-way hash and cannot be read by anyone, including administrators.</p>
      <h3>Reports and documents</h3>
      <p>The answers, budget lines and supporting documents your organization enters for each report, along with organization details such as address, contacts and mission.</p>
      <h3>Activity records</h3>
      <p>LedgerLine records who did what and when: sign-ins, saves, submissions, status changes, corrections and messages. These records support the review of public funds and cannot be edited or deleted through the application.</p>

      <h2 id="how-it-is-used">How it is used</h2>
      <ul>
        <li>to let funded organizations file mid-year and year-end reports on Council-funded initiatives</li>
        <li>to let Council Finance review, correct and accept those reports</li>
        <li>to send reminders and notices about reports that are due, late or need changes</li>
        <li>to keep a record of each submitted report and every change made to it</li>
      </ul>
      <p>We do not sell this information or use it for advertising.</p>

      <h2 id="who-can-see-it">Who can see it</h2>
      <ul>
        <li>People at a funded organization can see only their own organization&apos;s reports and profile.</li>
        <li>Council Finance staff can see all reports so they can review them.</li>
        <li>Finance administrators can also manage user accounts and settings.</li>
      </ul>
      <p>These limits are enforced by the database itself, not only by the pages you see.</p>

      <h2 id="ai-tools">Drafting tools</h2>
      <p>Some Finance tools can send the text of a form document, or the findings on a report, to an outside AI service to draft a form or a note to an organization. A Finance reviewer reads and edits every draft before it is used, and each use is recorded. The tools can be switched off for the whole system.</p>

      <h2 id="cookies">Cookies</h2>
      <p>LedgerLine uses only the cookies it needs to work:</p>
      <ul>
        <li>an access code cookie, which lasts 7 days</li>
        <li>a sign-in cookie, which ends after 8 hours or when you sign out</li>
        <li>a cookie that remembers whether you collapsed the Finance menu</li>
      </ul>
      <p>There are no analytics or advertising cookies.</p>

      <h2 id="how-long">How long we keep it</h2>
      <p>Submitted reports, their revisions and the activity records are kept as part of the record of Council funding. Draft reports can be changed by your organization until they are submitted.</p>

      <h2 id="questions">Questions</h2>
      <p>
        If you think information about you or your organization is wrong, or you have a question about this page, contact your LedgerLine administrator or Council Finance. See <Link href="/help#contact">Help</Link>.
      </p>
    </InfoPage>
  );
}
