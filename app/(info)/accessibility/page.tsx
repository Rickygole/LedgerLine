import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/shell/info-page";

export const metadata: Metadata = { title: "Accessibility" };

export default function AccessibilityPage() {
  return (
    <InfoPage title="Accessibility" updated="October 2026" intro={<p>LedgerLine should work for everyone who files or reviews a report, including people who use a keyboard, a screen reader, screen magnification or voice control.</p>}>
      <h2 id="target">Our target</h2>
      <p>We design and build LedgerLine to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA. This applies to the sign-in pages, the reporting portal used by funded organizations and the Finance workspace.</p>
      <p>In practice this means:</p>
      <ul>
        <li>every page and control can be reached and used with a keyboard, with a visible focus outline</li>
        <li>form fields have labels, and errors are listed at the top of the form and next to the field they belong to</li>
        <li>text and controls meet the AA contrast ratios, and color is never the only way a status is shown</li>
        <li>pages reflow on small screens and at 400 percent zoom without losing content</li>
        <li>animation is kept to loading and progress indicators, and is turned off when your device asks for reduced motion</li>
      </ul>

      <h2 id="testing">How we test</h2>
      <p>We check changes against the target before they are released:</p>
      <ul>
        <li>we complete the main tasks, such as signing in, filling in and submitting a report and reviewing a submission, using only a keyboard</li>
        <li>we check text and control colors with a contrast checker</li>
        <li>we review pages on a narrow phone screen and at high zoom</li>
        <li>we check page structure, headings, labels and status messages with a screen reader</li>
      </ul>
      <p>LedgerLine has not yet had an independent accessibility audit. Until it has, we do not claim full conformance with WCAG 2.1 AA.</p>

      <h2 id="known-issues">Known limitations</h2>
      <ul>
        <li>The status charts on the Finance dashboard are visual summaries. The same numbers are available as filtered lists on the Submissions page.</li>
        <li>Wide tables, such as the budget table, scroll sideways on small screens.</li>
        <li>Documents you upload are stored as provided. We cannot make an uploaded PDF or spreadsheet accessible if the original is not.</li>
      </ul>

      <h2 id="request-help">Ask for help or an accommodation</h2>
      <p>If something in LedgerLine stops you from completing a task, or you need information in a different format, contact your LedgerLine administrator or Council Finance. Tell us:</p>
      <ul>
        <li>the page you were on, or the report reference number if you have one (it starts with LL-)</li>
        <li>what you were trying to do and what happened</li>
        <li>the browser and any assistive technology you use</li>
      </ul>
      <p>If the problem could make a report late, say so when you contact us. Council Finance can work with you on another way to provide the information while the problem is fixed.</p>
      <p>
        We respond Monday to Friday, 9 AM to 5 PM ET. See <Link href="/help#contact">Help</Link> for who to contact.
      </p>
    </InfoPage>
  );
}
