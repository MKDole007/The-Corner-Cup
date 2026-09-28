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
    setupContactForm();
});

function setupContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!contactForm.reportValidity()) return;

        const formData = new FormData(contactForm);
        const status = document.getElementById('contactFormStatus');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        status.textContent = 'Sending your message...';
        status.classList.remove('is-error');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: String(formData.get('name')).trim(),
                    email: String(formData.get('email')).trim(),
                    message: String(formData.get('message')).trim()
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Unable to send your message.');

            contactForm.reset();
            status.textContent = 'Thank you. Your message has been sent successfully.';
        } catch (error) {
            status.textContent = error.message || 'Could not send your message. Check your connection and try again.';
            status.classList.add('is-error');
        } finally {
            submitButton.disabled = false;
        }
    });
}

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
