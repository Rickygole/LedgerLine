import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/shell/info-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using LedgerLine to file and review reports on Council-funded initiatives.",
};

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of use"
      updated="October 2026"
      intro={
        <p>
          LedgerLine is operated by the LedgerLine administrator for Council Finance and the organizations it funds. By
          signing in you agree to use it as described on this page.
        </p>
      }
    >
      <h2 id="who-can-use">Who can use LedgerLine</h2>
      <p>
        LedgerLine is for people who report on Council-funded initiatives for a funded organization, and for Council
        Finance staff who review those reports. You need an account created by a Finance administrator.
      </p>

      <h2 id="your-account">Your account</h2>
      <ul>
        <li>
          Your account is for you alone. Do not share your password or let someone else sign in as you. Each person who
          reports needs their own account.
        </li>
        <li>Use your work email address.</li>
        <li>
          If you think someone else has used your account, contact the LedgerLine administrator or Council Finance
          straight away.
        </li>
        <li>When someone leaves your organization, ask a Finance administrator to deactivate their account.</li>
      </ul>

      <h2 id="what-you-submit">What you submit</h2>
      <ul>
        <li>
          When you submit a report you certify that it is accurate and complete. Check the answers and budget before you
          submit.
        </li>
        <li>
          A submitted report is kept as a permanent record. It cannot be deleted. If Finance asks for changes, you
          update and resubmit it, and both versions are kept.
        </li>
        <li>
          Finance may correct an answer during review. Every correction is saved as a new revision with the reason and
          the name of the person who made it.
        </li>
        <li>
          Upload only documents that support the report. Files must be PDF, Word (.docx), Excel (.xlsx) or CSV, must not
          contain macros, and be no larger than 25 MB each, with no more than 20 files on one report.
        </li>
      </ul>

      <h2 id="acceptable-use">Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>try to view or change another organization&apos;s information</li>
        <li>upload files that contain malicious code or information unrelated to the report</li>
        <li>use automated tools to copy data from LedgerLine or to put heavy load on it</li>
        <li>try to get around sign-in, access codes or other security controls</li>
      </ul>
      <p>A Finance administrator may deactivate an account that is used in these ways.</p>

      <h2 id="records">Activity records</h2>
      <p>
        LedgerLine records sign-ins and the actions taken on each report, including who took them and when. See{" "}
        <Link href="/privacy">Privacy</Link> for what is kept and who can see it.
      </p>

      <h2 id="availability">Availability</h2>
      <p>
        LedgerLine may be unavailable for short periods for maintenance. If you cannot reach it close to a due date,
        contact Council Finance before the deadline so the delay is on record.
      </p>

      <h2 id="changes">Changes to these terms</h2>
      <p>
        The LedgerLine administrator may update these terms. The date at the top of the page shows when they last
        changed.
      </p>
    </InfoPage>
  );
}
