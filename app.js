document.addEventListener('DOMContentLoaded', () => {
    updateNav();
});

function updateNav() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const navLinks = document.querySelector('.nav-links');
    
    if (currentUser && navLinks) {
        const oldLinks = Array.from(navLinks.querySelectorAll('a')).filter(a => 
            a.textContent.trim() === 'Logout' || 
            a.textContent.trim() === 'Login' ||
            a.classList.contains('avatar-logo')
        );
        oldLinks.forEach(l => l.remove());

        const avatarLink = document.createElement('a');
        avatarLink.href = 'profile.html';
        avatarLink.className = 'avatar-logo';
        avatarLink.textContent = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
        
        navLinks.appendChild(avatarLink);
    } else if (!currentUser && navLinks) {
        const oldLinks = Array.from(navLinks.querySelectorAll('a')).filter(a => 
            a.textContent.trim() === 'Logout' || 
            a.textContent.trim() === 'Login' ||
            a.classList.contains('avatar-logo')
        );
        oldLinks.forEach(l => l.remove());
        
        const loginLink = document.createElement('a');
        loginLink.href = 'login.html';
        loginLink.textContent = 'Login';
        loginLink.style.border = '1px solid #fff7ed';
        navLinks.appendChild(loginLink);
    }
}
