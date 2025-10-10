import React from 'react';

type Props = {
  title?: string;
  icon?: React.ReactNode; // optional custom icon
  actions?: React.ReactNode; // right side custom actions
  children?: React.ReactNode;
};

const PageShell: React.FC<Props> = ({
  title = '',
  icon,
  actions,
  children,
}) => {

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full px-3 sm:px-4 py-3 sm:py-4 space-y-4 sm:space-y-6">
        {/* Compact Header */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon ? (
                <div className="p-1.5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
                  {icon}
                </div>
              ) : (
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-md">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3h18v18H3z" stroke="currentColor" strokeWidth="1.5"/></svg>
                </div>
              )}
              <h1 className="text-lg font-semibold text-white">{title}</h1>
            </div>

            <div className="flex items-center gap-3">
              {actions}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="space-y-4 sm:space-y-6" role="main">{children}</main>
      </div>
    </div>
  );
};

export default PageShell;
