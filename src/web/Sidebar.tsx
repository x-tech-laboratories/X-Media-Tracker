// The sidebar: each section's heading, such as Movies & Series, over its pages, then History, above the Shell's own foot rows.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { PageFeature } from "./features.tsx";

// ── Rows ─────────────────────────────────────────────────────────────────────

function Row({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href} className={active ? "tree-row active" : "tree-row"} aria-current={active ? "page" : undefined}>
      <span className="tree-label">{label}</span>
    </a>
  );
}

function Heading({ label }: { label: string }) {
  return (
    <div className="tree-row tree-heading" role="heading" aria-level={2}>
      <span className="tree-label">{label}</span>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  features: PageFeature[];
  // The route's first part, such as "movies", "history" or "settings".
  section: string;
  // The page within that section, such as "titles".
  page: string;
}

export function Sidebar({ features, section, page }: SidebarProps) {
  return (
    <nav className="sidebar-nav" aria-label="Sections">
      {features.flatMap((feature) => [
        <Heading key={feature.id} label={feature.label} />,
        ...feature.pages.map((each) => <Row key={`${feature.id}/${each.id}`} href={`#/${feature.id}/${each.id}`} label={each.label} active={section === feature.id && page === each.id} />),
      ])}
      <Row href="#/history" label="History" active={section === "history"} />
    </nav>
  );
}
