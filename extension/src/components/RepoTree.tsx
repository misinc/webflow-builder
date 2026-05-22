import { RepoTreeResponse } from "../api/client.js";

interface RepoTreeProps {
  tree: RepoTreeResponse | null;
  selectedPageId: string | null;
  selectedSectionId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectSection: (pageId: string, sectionId: string) => void;
}

export function RepoTree({
  tree,
  selectedPageId,
  selectedSectionId,
  onSelectPage,
  onSelectSection
}: RepoTreeProps) {
  if (!tree) {
    return <p className="empty-state">Sync a repo to load its supported pages and sections.</p>;
  }

  return (
    <div className="tree">
      {tree.pages.map(({ page, sections }) => (
        <section
          key={page.id}
          className={`tree-page ${selectedPageId === page.id ? "is-active" : ""}`}
        >
          <button
            type="button"
            className="tree-page-button"
            onClick={() => onSelectPage(page.id)}
          >
            <span>{page.name}</span>
            <small>{page.route}</small>
          </button>
          <div className="tree-sections">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`tree-section ${
                  selectedSectionId === section.id ? "is-selected" : ""
                }`}
                onClick={() => onSelectSection(page.id, section.id)}
              >
                <span>{section.name}</span>
                <small>{section.sourceFile}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
