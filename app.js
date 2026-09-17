function safeParseFromStorage(key) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateNav();
});

function updateNav() {
    const currentUser = safeParseFromStorage('currentUser');
    const navLinks = document.querySelector('.nav-links');

    if (!navLinks) return;

    const oldLinks = Array.from(navLinks.querySelectorAll('a')).filter(a =>
        a.textContent.trim() === 'Login' ||
        a.classList.contains('avatar-logo')
    );
    oldLinks.forEach(link => link.remove());

    if (currentUser) {
        const avatarLink = document.createElement('a');
        avatarLink.href = 'profile.html';
        avatarLink.className = 'avatar-logo';
        avatarLink.textContent = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
        avatarLink.title = currentUser.name || 'Profile';
        navLinks.appendChild(avatarLink);
    } else {
        const loginLink = document.createElement('a');
        loginLink.href = 'login.html';
        loginLink.textContent = 'Login';
        loginLink.style.border = '1px solid #fff7ed';
        navLinks.appendChild(loginLink);
    }
}
