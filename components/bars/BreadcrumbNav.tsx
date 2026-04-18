'use client';

interface BreadcrumbNavProps {
  folderPath: Array<{ id: string; name: string }>;
  onNavigate: (folderId: string) => void;
}

export default function BreadcrumbNav({ folderPath, onNavigate }: BreadcrumbNavProps) {
  if (folderPath.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
      {folderPath.map((folder, index) => {
        const isLast = index === folderPath.length - 1;

        return (
          <div key={folder.id} className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <span className="text-gray-400 select-none">›</span>
            )}
            {isLast ? (
              <span className="font-semibold text-gray-900 px-2 py-1">
                {folder.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(folder.id)}
                className="px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors cursor-pointer"
              >
                {folder.name}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
