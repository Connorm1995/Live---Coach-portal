import React from 'react';
import './TopNav.css';

function TopNav({ activeTab, onTabChange }) {
  return (
    <nav className="top-nav">
      <div className="top-nav__left">
        <img
          src="/logo-plus-name.png"
          alt="My Fit Coach"
          className="top-nav__logo"
        />
      </div>
      <div className="top-nav__tabs">
        <button
          className={`top-nav__tab ${activeTab === 'client' ? 'top-nav__tab--active' : ''}`}
          onClick={() => onTabChange('client')}
        >
          Client View
        </button>
        <button
          className={`top-nav__tab ${activeTab === 'coach' ? 'top-nav__tab--active' : ''}`}
          onClick={() => onTabChange('coach')}
        >
          Coach's Corner
        </button>
      </div>
    </nav>
  );
}

export default TopNav;
