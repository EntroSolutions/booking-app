import React from 'react';

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="dashboard-layout">
      <header>
        <nav>Navbar here</nav>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default DashboardLayout;