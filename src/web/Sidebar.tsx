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

// A section's pages under its heading, grouped so a reader hears which section a page such as Library is in.
function Group({ feature, section, page }: { feature: PageFeature; section: string; page: string }) {
  const heading_id = `sidebar-${feature.id}`;
  return (
    <div className="sidebar-section" role="group" aria-labelledby={heading_id}>
      <div id={heading_id} className="tree-row tree-heading">
        <span className="tree-label">{feature.label}</span>
      </div>
      {feature.pages.map((each) => (
        <Row key={each.id} href={`#/${feature.id}/${each.id}`} label={each.label} active={section === feature.id && page === each.id} />
      ))}
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
      {features.map((feature) => (
        <Group key={feature.id} feature={feature} section={section} page={page} />
      ))}
      <Row href="#/history" label="History" active={section === "history"} />
    </nav>
  );
}
