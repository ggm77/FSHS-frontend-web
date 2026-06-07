interface Props {
  currentUserId?: number | null;
}

export function UsersScreen({}: Props = {}) {
  return (
    <div className="content">
      <div className="page-h">
        <div>
          <h1>사용자</h1>
        </div>
      </div>
    </div>
  );
}
