// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Email signup: validate, POST to Formspree, show inline status.
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mlgzdyro';

function wireSignup(formId, msgId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const msg = document.getElementById(msgId);
  const input = form.querySelector('input[type="email"]');
  const btn = form.querySelector('button[type="submit"]');
  const originalBtnHTML = btn.innerHTML;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = (input.value || '').trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    msg.classList.remove('is-error');

    if (!valid) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('is-error');
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    msg.textContent = '';

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: value,
          source: 'studypartner-landing',
        }),
      });

      if (res.ok) {
        msg.textContent = "Thanks! We'll email you the day we launch.";
        btn.textContent = 'Joined ✓';
        input.value = '';
        // Keep button disabled to prevent duplicate submissions.
        return;
      }

      const data = await res.json().catch(() => ({}));
      const detail = data && data.errors && data.errors[0] && data.errors[0].message;
      msg.textContent = detail || "Something went wrong. Please try again.";
      msg.classList.add('is-error');
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
    } catch (err) {
      msg.textContent = "Couldn't reach the server. Check your connection and try again.";
      msg.classList.add('is-error');
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
    }
  });
}

wireSignup('notify', 'signupMsg');
wireSignup('notify2', 'signupMsg2');

// Scroll-reveal for the second section only (hero is immediately visible)
const revealTargets = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-in'));
}
