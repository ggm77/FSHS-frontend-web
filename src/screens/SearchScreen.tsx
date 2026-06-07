interface Props {
  rootFolderId?: number | null;
  onOpenVideo?: (fileId: number) => void;
  initialQuery?: string;
}

export function SearchScreen({}: Props = {}) {
  return (
    <div className="content">
      <div className="page-h">
        <div>
          <h1>검색</h1>
        </div>
      </div>
    </div>
  );
}
