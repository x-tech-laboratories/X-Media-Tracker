// The sidebar: each feature's pages and History as rows alike, and Users above the Shell's own foot rows.

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

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  features: PageFeature[];
  // The route's first part, such as "library", "history" or "settings".
  section: string;
  // The page within that section, such as "titles".
  page: string;
}

export function Sidebar({ features, section, page }: SidebarProps) {
  return (
    <nav className="sidebar-nav" aria-label="Sections">
      {features.flatMap((feature) =>
        feature.pages.map((each) => <Row key={`${feature.id}/${each.id}`} href={`#/${feature.id}/${each.id}`} label={each.label} active={section === feature.id && page === each.id} />),
      )}
      <Row href="#/history" label="History" active={section === "history"} />
    </nav>
  );
}

// Users, for an admin signed in on the server, above the Shell's own theme, account and Settings rows.
export function SidebarFoot({ section, show_users = false }: { section: string; show_users?: boolean }) {
  return show_users ? <Row href="#/users" label="Users" active={section === "users"} /> : null;
}
