import { 
  watchAuthState, 
  loginWithEmail, 
  registerWithEmail, 
  loginWithGoogle, 
  logout, 
  sendPasswordReset 
} from './auth';
import { 
  getChannels, 
  addChannel, 
  deleteChannel, 
  updateChannel,
  getVideos, 
  addVideo, 
  updateVideoStatus, 
  deleteVideo, 
  getTopics, 
  addTopic, 
  updateTopic, 
  deleteTopic, 
  getImageResources, 
  addImageResource, 
  updateImageResource, 
  deleteImageResource, 
  getScriptResources, 
  addScriptResource, 
  updateScriptResource, 
  deleteScriptResource 
} from './db';
import { Router } from './router';

// ==========================================================================
// Application State
// ==========================================================================
const state = {
  currentUser: null,
  channels: [],
  activeChannel: null,
  activeChannelVideos: [],
  allVideos: [], // Cached videos for all channels for the calendar
  calendarDate: new Date(), // Focus date for week/month views
  calendarView: 'month', // 'month' | 'week'
  calendarFilter: 'all', // 'all' | channelId
  dashboardTaskFilter: 'all' // 'all' | 'pending' | 'completed'
};

let router;

// ==========================================================================
// Toast System
// ==========================================================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  if (type === 'warning') icon = 'alert-circle';

  toast.innerHTML = `
    <div class="toast-content">
      <i data-lucide="${icon}"></i>
      <span>${message}</span>
    </div>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Close event listener
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  });

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================================================
// Date Helpers
// ==========================================================================
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekRange(date = new Date()) {
  const currentDay = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const distanceToMon = currentDay === 0 ? 6 : currentDay - 1; // Start week on Monday
  
  const start = new Date(date);
  start.setDate(date.getDate() - distanceToMon);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  
  return {
    start: formatDate(start),
    end: formatDate(end),
    startDateObj: start,
    endDateObj: end
  };
}

// Generate dynamic avatars
function getGradientStyle(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 50) % 360;
  return `background: linear-gradient(135deg, hsl(${hue1}, 75%, 55%), hsl(${hue2}, 75%, 40%));`;
}

function getDaysLeftInWeek(weekEndObj) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(weekEndObj);
  end.setHours(0, 0, 0, 0);
  const diff = end - today;
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return '0 days left';
  if (days === 0) return 'last day';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function getDaysForWeeklyTasks(targetCount, weekStartObj) {
  const dates = [];
  const distribution = {
    1: [2], // Wednesday
    2: [1, 3], // Tuesday, Thursday
    3: [0, 2, 4], // Monday, Wednesday, Friday
    4: [0, 2, 4, 6], // Monday, Wednesday, Friday, Sunday
    5: [0, 1, 2, 3, 4], // Mon-Fri
    6: [0, 1, 2, 3, 4, 5], // Mon-Sat
    7: [0, 1, 2, 3, 4, 5, 6] // Mon-Sun
  };
  
  let days = [];
  if (targetCount <= 7) {
    days = distribution[targetCount] || [2];
  } else {
    for (let i = 0; i < targetCount; i++) {
      days.push(i % 7);
    }
  }
  
  for (const dayIndex of days) {
    const d = new Date(weekStartObj);
    d.setDate(weekStartObj.getDate() + dayIndex);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayVal = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dayVal}`);
  }
  return dates;
}

async function autoScheduleChannelTasks(channel, scheduleMethod, suppressToast = false) {
  const uid = state.currentUser.uid;
  const channelId = channel.id;
  const targetCount = channel.targetTasks !== undefined ? channel.targetTasks : 3;
  const freq = channel.frequency || 'weekly';
  const todayStr = getTodayStr();
  const week = getWeekRange();

  try {
    // 1. Get existing videos for the channel to remove any pending videos for this period
    const existingVideos = await getVideos(uid, channelId);
    const pendingVideosToDelete = existingVideos.filter(v => {
      if (v.status !== 'pending') return false;
      if (freq === 'daily') {
        return v.scheduledDate === todayStr;
      } else {
        return v.scheduledDate >= week.start && v.scheduledDate <= week.end;
      }
    });

    for (const v of pendingVideosToDelete) {
      await deleteVideo(uid, channelId, v.id);
    }

    // 2. Determine target dates
    let targetDates = [];
    if (freq === 'daily') {
      for (let i = 0; i < targetCount; i++) {
        targetDates.push(todayStr);
      }
    } else {
      targetDates = getDaysForWeeklyTasks(targetCount, week.startDateObj);
    }

    // 3. Determine video titles
    let titles = [];
    if (scheduleMethod === 'topic') {
      const allTopics = await getTopics(uid, channelId);
      const availableTopics = allTopics.filter(t => !t.isUsed);
      
      for (let i = 0; i < targetCount; i++) {
        if (i < availableTopics.length) {
          const topic = availableTopics[i];
          titles.push({ title: topic.title, topicId: topic.id });
        } else {
          titles.push({ title: `${channel.channelName} - Random Video #${i + 1}`, topicId: null });
        }
      }
    } else {
      for (let i = 0; i < targetCount; i++) {
        titles.push({ title: `${channel.channelName} - Random Video #${i + 1}`, topicId: null });
      }
    }

    // 4. Add the videos to Firestore and update topics status
    for (let i = 0; i < targetCount; i++) {
      const scheduledDate = targetDates[i];
      const videoInfo = titles[i];
      
      await addVideo(uid, channelId, videoInfo.title, scheduledDate);
      
      if (videoInfo.topicId) {
        await updateTopic(uid, channelId, videoInfo.topicId, { isUsed: true });
      }
    }

    if (!suppressToast) {
      showToast(`Successfully scheduled ${targetCount} tasks!`, 'success');
    }
  } catch (err) {
    console.error("Auto scheduling error:", err);
    if (!suppressToast) {
      showToast(`Failed to auto-schedule: ${err.message}`, 'error');
    }
    throw err;
  }
}

function openAutoScheduleModal(channel, onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'auto-schedule-modal';
  
  const frequency = channel.frequency || 'weekly';
  const targetTasks = channel.targetTasks !== undefined ? channel.targetTasks : 3;

  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 460px;">
      <div class="modal-header">
        <h3 class="modal-title">Auto-Schedule Task Settings</h3>
        <button class="btn-modal-close" id="close-auto-sched-btn"><i data-lucide="x"></i></button>
      </div>
      <div>
        <p style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
          Choose how you would like to auto-populate the calendar for <strong>${channel.channelName}</strong>. 
          The system will auto-populate <strong>${targetTasks}</strong> tasks for the current <strong>${frequency}</strong> period.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
          <label class="auto-sched-option-card">
            <input type="radio" name="auto-sched-method" value="topic" checked>
            <div class="option-details">
              <strong>Topic Video Bucket</strong>
              <span>Fetch unused ideas from this channel's Topic Bucket. If there are not enough ideas, placeholder random videos will be used for the rest.</span>
            </div>
          </label>
          
          <label class="auto-sched-option-card">
            <input type="radio" name="auto-sched-method" value="random">
            <div class="option-details">
              <strong>Random Videos</strong>
              <span>Generate placeholder titles like: <em>${channel.channelName} - Random Video #1</em>.</span>
            </div>
          </label>
        </div>
      </div>
      
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="skip-auto-sched-btn">Skip Scheduling</button>
        <button type="button" class="btn btn-primary" id="run-auto-sched-btn">Auto-Schedule Tasks</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => {
    overlay.remove();
    if (onComplete) onComplete();
  };

  document.getElementById('close-auto-sched-btn').addEventListener('click', close);
  document.getElementById('skip-auto-sched-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('run-auto-sched-btn').addEventListener('click', async () => {
    const method = overlay.querySelector('input[name="auto-sched-method"]:checked').value;
    close();
    
    renderLoading('app-container', 'Generating automatic video task schedules...');
    await autoScheduleChannelTasks(channel, method);
    
    if (window.location.hash.startsWith('#workshop/')) {
      const channelId = window.location.hash.split('/')[1];
      renderWorkshop(channelId);
    } else {
      renderDashboard();
    }
  });
}

function openAutoScheduleAllModal() {
  if (state.channels.length === 0) {
    showToast('No channels configured to auto-schedule.', 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'auto-schedule-all-modal';
  
  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 460px;">
      <div class="modal-header">
        <h3 class="modal-title">Bulk Auto-Schedule Settings</h3>
        <button class="btn-modal-close" id="close-auto-sched-all-btn"><i data-lucide="x"></i></button>
      </div>
      <div>
        <p style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
          Choose how you would like to auto-populate the calendar for <strong>all ${state.channels.length} channels</strong>. 
          The system will auto-populate tasks for each channel based on their individual frequency and target upload settings.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
          <label class="auto-sched-option-card">
            <input type="radio" name="auto-sched-all-method" value="topic" checked>
            <div class="option-details">
              <strong>Topic Video Bucket</strong>
              <span>Fetch unused ideas from each channel's Topic Bucket. If there are not enough ideas, placeholder random videos will be used for the rest.</span>
            </div>
          </label>
          
          <label class="auto-sched-option-card">
            <input type="radio" name="auto-sched-all-method" value="random">
            <div class="option-details">
              <strong>Random Videos</strong>
              <span>Generate placeholder titles like: <em>[Channel Name] - Random Video #N</em>.</span>
            </div>
          </label>
        </div>
      </div>
      
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="skip-auto-sched-all-btn">Cancel</button>
        <button type="button" class="btn btn-primary" id="run-auto-sched-all-btn">Auto-Schedule All</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => {
    overlay.remove();
  };

  document.getElementById('close-auto-sched-all-btn').addEventListener('click', close);
  document.getElementById('skip-auto-sched-all-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('run-auto-sched-all-btn').addEventListener('click', async () => {
    const method = overlay.querySelector('input[name="auto-sched-all-method"]:checked').value;
    close();
    
    renderLoading('app-container', 'Generating automatic video task schedules for all channels...');
    
    let successCount = 0;
    let failCount = 0;
    for (const channel of state.channels) {
      if (channel.isBlocked) {
        continue;
      }
      try {
        await autoScheduleChannelTasks(channel, method, true);
        successCount++;
      } catch (err) {
        console.error(`Failed to auto-schedule channel ${channel.channelName}:`, err);
        failCount++;
      }
    }
    
    if (failCount === 0) {
      showToast(`Successfully scheduled tasks for all ${successCount} channels!`, 'success');
    } else {
      showToast(`Scheduled tasks for ${successCount} channels. ${failCount} channels failed.`, 'warning');
    }
    
    renderDashboard();
  });
}

// ==========================================================================
// Core Authentication Guard
// ==========================================================================
function checkAuth() {
  return state.currentUser !== null;
}

function toggleHeaderVisibility() {
  const header = document.getElementById('main-header');
  if (state.currentUser) {
    header.classList.remove('hidden');
    document.getElementById('header-user-email').textContent = state.currentUser.email;
  } else {
    header.classList.add('hidden');
  }
}

// Initialize Router
function initAppRouter() {
  const routes = {
    '#login': renderLogin,
    '#register': renderRegister,
    '#forgot-password': renderForgotPassword,
    '#dashboard': renderDashboard,
    '#calendar': renderCalendar,
    '#workshop/:channelId': (params) => renderWorkshop(params.channelId)
  };

  router = new Router(routes, checkAuth);
}

// Watch Auth state
watchAuthState(async (user) => {
  state.currentUser = user;
  toggleHeaderVisibility();
  
  if (user) {
    // Cache channel list on login
    try {
      state.channels = await getChannels(user.uid);
    } catch (e) {
      console.error(e);
    }
    
    // Redirect to dashboard if on auth routes, router handles it via window.location.hash
    if (['#login', '#register', '#forgot-password', ''].includes(window.location.hash)) {
      window.location.hash = '#dashboard';
    } else {
      router.handleRoute(); // refresh current route with user context
    }
  } else {
    state.channels = [];
    state.activeChannel = null;
    state.allVideos = [];
    window.location.hash = '#login';
  }
});

// ==========================================================================
// Navbar Actions & Navigation Highlighting
// ==========================================================================
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await logout();
    showToast('Successfully logged out!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('nav-brand-btn').addEventListener('click', () => {
  if (state.currentUser) {
    window.location.hash = '#dashboard';
  } else {
    window.location.hash = '#login';
  }
});

// Hamburger Mobile Toggle
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');
menuToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

// Highlight Active Nav links
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  
  // Close mobile nav on transition
  navLinks.classList.remove('open');
  
  const linkDashboard = document.getElementById('link-dashboard');
  const linkCalendar = document.getElementById('link-calendar');
  
  if (linkDashboard && linkCalendar) {
    linkDashboard.classList.remove('active');
    linkCalendar.classList.remove('active');
    
    if (hash === '#dashboard' || hash.startsWith('#workshop/')) {
      linkDashboard.classList.add('active');
    } else if (hash === '#calendar') {
      linkCalendar.classList.add('active');
    }
  }
});

// ==========================================================================
// View Engine: Render Loading
// ==========================================================================
function renderLoading(containerId, text = 'Loading data...') {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="page-loader">
      <div class="spinner"></div>
      <div class="page-loader-text">${text}</div>
    </div>
  `;
}

// ==========================================================================
// View Engine: Authentication Views
// ==========================================================================
function renderLogin() {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo"><i data-lucide="play"></i></div>
          <h2 class="auth-title">Welcome Back</h2>
          <p class="auth-subtitle">Sign in to manage your channels</p>
        </div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-email">Email Address</label>
            <div class="input-wrapper">
              <i data-lucide="mail" class="input-icon"></i>
              <input type="email" id="login-email" class="form-input" placeholder="you@example.com" required autocomplete="username">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <div class="input-wrapper">
              <i data-lucide="lock" class="input-icon"></i>
              <input type="password" id="login-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
            </div>
          </div>
          <div class="auth-actions">
            <label class="toggle-switch-wrapper">
              <input type="checkbox" class="toggle-switch-input">
              <span class="toggle-switch"></span>
              <span class="toggle-label">Remember me</span>
            </label>
            <a href="#forgot-password" class="forgot-link">Forgot Password?</a>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <i data-lucide="log-in"></i> Sign In
          </button>
        </form>
        <div class="divider">Or Sign In With</div>
        <button id="google-login-btn" class="btn btn-google">
          <svg style="width:18px;height:18px" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Google Workspace
        </button>
        <p class="auth-footer">
          Don't have an account? <a href="#register">Create Account</a>
        </p>
      </div>
    </div>
  `;
  lucide.createIcons();

  // Email Submit
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    try {
      renderLoading('app-container', 'Signing you in...');
      await loginWithEmail(email, password);
      showToast('Logged in successfully!', 'success');
    } catch (error) {
      renderLogin(); // Render page again
      showToast(error.message, 'error');
    }
  });

  // Google Sign-in
  document.getElementById('google-login-btn').addEventListener('click', async () => {
    try {
      renderLoading('app-container', 'Connecting to Google...');
      await loginWithGoogle();
      showToast('Logged in with Google!', 'success');
    } catch (error) {
      renderLogin();
      showToast(error.message, 'error');
    }
  });
}

function renderRegister() {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo"><i data-lucide="play"></i></div>
          <h2 class="auth-title">Create Account</h2>
          <p class="auth-subtitle">Start planning your channel uploads</p>
        </div>
        <form id="register-form">
          <div class="form-group">
            <label class="form-label" for="reg-email">Email Address</label>
            <div class="input-wrapper">
              <i data-lucide="mail" class="input-icon"></i>
              <input type="email" id="reg-email" class="form-input" placeholder="name@domain.com" required autocomplete="username">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-password">Password</label>
            <div class="input-wrapper">
              <i data-lucide="lock" class="input-icon"></i>
              <input type="password" id="reg-password" class="form-input" placeholder="Min. 6 characters" required autocomplete="new-password">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-confirm">Confirm Password</label>
            <div class="input-wrapper">
              <i data-lucide="shield-check" class="input-icon"></i>
              <input type="password" id="reg-confirm" class="form-input" placeholder="••••••••" required autocomplete="new-password">
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <i data-lucide="user-plus"></i> Register
          </button>
        </form>
        <p class="auth-footer">
          Already have an account? <a href="#login">Log In</a>
        </p>
      </div>
    </div>
  `;
  lucide.createIcons();

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    
    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    try {
      renderLoading('app-container', 'Creating your account...');
      await registerWithEmail(email, password);
      showToast('Registered successfully!', 'success');
    } catch (error) {
      renderRegister();
      showToast(error.message, 'error');
    }
  });
}

function renderForgotPassword() {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo"><i data-lucide="key-round"></i></div>
          <h2 class="auth-title">Reset Password</h2>
          <p class="auth-subtitle">We will send you link instructions</p>
        </div>
        <form id="reset-form">
          <div class="form-group">
            <label class="form-label" for="reset-email">Email Address</label>
            <div class="input-wrapper">
              <i data-lucide="mail" class="input-icon"></i>
              <input type="email" id="reset-email" class="form-input" placeholder="you@domain.com" required autocomplete="username">
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <i data-lucide="send"></i> Send Link
          </button>
        </form>
        <p class="auth-footer">
          Remembered password? <a href="#login">Return to Login</a>
        </p>
      </div>
    </div>
  `;
  lucide.createIcons();

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    
    try {
      renderLoading('app-container', 'Sending recovery email...');
      await sendPasswordReset(email);
      showToast('Recovery link sent to your email!', 'success');
      window.location.hash = '#login';
    } catch (error) {
      renderForgotPassword();
      showToast(error.message, 'error');
    }
  });
}

// ==========================================================================
// View Engine: Dashboard View
// ==========================================================================
async function renderDashboard() {
  renderLoading('app-container', 'Loading channels & schedules...');
  
  let allVideos = [];
  try {
    state.channels = await getChannels(state.currentUser.uid);
    if (state.channels.length > 0) {
      const videoFetchPromises = state.channels.map(async (c) => {
        const vids = await getVideos(state.currentUser.uid, c.id);
        return vids.map(v => ({ ...v, channelId: c.id, channelName: c.channelName }));
      });
      const vidsArray = await Promise.all(videoFetchPromises);
      allVideos = vidsArray.flat().sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

      // Calculate tasksLeft for each channel
      const today = getTodayStr();
      const week = getWeekRange();
      
      state.channels.forEach(channel => {
        const videos = allVideos.filter(v => v.channelId === channel.id);
        const freq = channel.frequency || 'weekly';
        const target = channel.targetTasks !== undefined ? channel.targetTasks : 3;
        
        let filteredTasks = [];
        if (freq === 'daily') {
          filteredTasks = videos.filter(v => v.scheduledDate === today);
        } else {
          filteredTasks = videos.filter(v => v.scheduledDate >= week.start && v.scheduledDate <= week.end);
        }
        
        const completedCount = filteredTasks.filter(t => t.status === 'done').length;
        channel.tasksLeft = Math.max(0, target - completedCount);
      });

      // Sort channels: active first (with incomplete first, then done), blocked last
      state.channels.sort((a, b) => {
        const blockA = a.isBlocked ? 1 : 0;
        const blockB = b.isBlocked ? 1 : 0;
        if (blockA !== blockB) {
          return blockA - blockB; // active (0) first, blocked (1) last
        }
        
        // Both are active or both are blocked
        if (!a.isBlocked) {
          const doneA = a.tasksLeft === 0 ? 1 : 0;
          const doneB = b.tasksLeft === 0 ? 1 : 0;
          if (doneA !== doneB) {
            return doneA - doneB; // incomplete (0) first, completed (1) last
          }
        }
        
        const freqA = a.frequency || 'weekly';
        const freqB = b.frequency || 'weekly';
        if (freqA === 'daily' && freqB !== 'daily') return -1;
        if (freqA !== 'daily' && freqB === 'daily') return 1;
        return 0;
      });
    }
  } catch (err) {
    console.error("Dashboard error:", err);
    const container = document.getElementById('app-container');
    container.innerHTML = `
      <div class="view-header animate-fade-in">
        <div class="view-title-group">
          <h2>Central Dashboard</h2>
          <p class="view-description">Track scheduled uploads and status badges for all active channels.</p>
        </div>
      </div>
      <div class="animate-fade-in" style="max-width: 600px; margin: 2rem auto; padding: 2.5rem; background: white; border-radius: var(--radius-lg); border: 1px solid var(--border-color); box-shadow: var(--shadow-lg); text-align: center;">
        <div style="background-color: var(--danger-bg); color: var(--danger); width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
          <i data-lucide="alert-triangle" style="width: 32px; height: 32px;"></i>
        </div>
        <h3 style="margin-bottom: 0.75rem; font-family: var(--font-display); font-size: 1.4rem;">Unable to Connect to Firestore</h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1.75rem; line-height: 1.6; text-align: left; padding: 0.75rem; border-left: 3px solid var(--danger); background-color: #fefdfd;">
          ${err.message || err}
        </p>
        <div style="background-color: var(--primary-light); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid rgba(22, 163, 74, 0.2); text-align: left; font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 2rem;">
          <strong style="color: var(--primary-hover); display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.5rem;">
            <i data-lucide="info" style="width: 16px; height: 16px;"></i> First-Time Setup Troubleshooting:
          </strong>
          <ul style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.4rem; line-height: 1.4;">
            <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" style="font-weight:600; text-decoration:underline;">Firebase Console</a>.</li>
            <li>Select the project <strong>yt-manager-8fa09</strong>.</li>
            <li>Click <strong>Firestore Database</strong> in the left sidebar and click <strong>Create Database</strong>.</li>
            <li>Set the security rules to <strong>Test Mode</strong> (or write rules allowing reads/writes).</li>
            <li>Check your network connection and click "Retry Connecting" below.</li>
          </ul>
        </div>
        <button class="btn btn-primary" id="retry-dashboard-btn" style="padding: 0.75rem 2rem;">
          <i data-lucide="refresh-cw"></i> Retry Connecting
        </button>
      </div>
    `;
    lucide.createIcons();
    document.getElementById('retry-dashboard-btn').addEventListener('click', renderDashboard);
    showToast('Connection to database failed.', 'error');
    return;
  }

  const container = document.getElementById('app-container');
  
  if (state.channels.length === 0) {
    container.innerHTML = `
      <div class="view-header animate-fade-in">
        <div class="view-title-group">
          <h2>Central Dashboard</h2>
          <p class="view-description">Track scheduled uploads and status badges for all active channels.</p>
        </div>
        <button class="btn btn-primary" id="open-add-channel-modal-btn">
          <i data-lucide="plus"></i> Add Channel
        </button>
      </div>
      
      <div class="dashboard-grid animate-fade-in" id="dashboard-grid">
        <div class="add-channel-ghost" id="ghost-card-btn">
          <div class="ghost-icon-wrapper">
            <i data-lucide="plus"></i>
          </div>
          <h3>Add Your First YouTube Channel</h3>
          <p>Keep your content directory and topics structured.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
    
    document.getElementById('ghost-card-btn').addEventListener('click', openAddChannelModal);
    document.getElementById('open-add-channel-modal-btn').addEventListener('click', openAddChannelModal);
    return;
  }

  container.innerHTML = `
    <div class="view-header animate-fade-in">
      <div class="view-title-group">
        <h2>Central Dashboard</h2>
        <p class="view-description">Track scheduled uploads and status badges for all active channels.</p>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button class="btn btn-outline" id="auto-schedule-all-btn">
          <i data-lucide="calendar-days"></i> Auto-Schedule All
        </button>
        <button class="btn btn-primary" id="open-add-channel-modal-btn">
          <i data-lucide="plus"></i> Add Channel
        </button>
      </div>
    </div>
    
    <div class="dashboard-grid animate-fade-in" id="dashboard-grid" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
      <!-- Cards will load here -->
    </div>
  `;

  // Render Channel Cards
  const grid = document.getElementById('dashboard-grid');
  document.getElementById('open-add-channel-modal-btn').addEventListener('click', openAddChannelModal);
  const autoSchedBtn = document.getElementById('auto-schedule-all-btn');
  if (autoSchedBtn) {
    autoSchedBtn.addEventListener('click', openAutoScheduleAllModal);
  }

  const cardsHtmlPromise = state.channels.map(async (channel) => {
    let badgeClass = 'badge-green';
    let badgeLabel = 'On Schedule';
    let badgeIcon = 'check-circle';

    // Filter videos for this channel from the pre-fetched allVideos list
    const videos = allVideos.filter(v => v.channelId === channel.id);
    const today = getTodayStr();
    const week = getWeekRange();

    const hasPendingToday = videos.some(v => v.status === 'pending' && v.scheduledDate === today);
    const hasPendingThisWeek = videos.some(v => v.status === 'pending' && v.scheduledDate >= week.start && v.scheduledDate <= week.end);

    if (channel.isBlocked) {
      badgeClass = 'badge-grey';
      badgeLabel = 'Blocked';
      badgeIcon = 'ban';
    } else if (hasPendingToday) {
      badgeClass = 'badge-red';
      badgeLabel = 'Due Today';
      badgeIcon = 'alert-circle';
    } else if (hasPendingThisWeek) {
      badgeClass = 'badge-yellow';
      badgeLabel = 'Due This Week';
      badgeIcon = 'clock';
    }

    // Filter tasks for this channel based on frequency setting (Daily / Weekly)
    const freq = channel.frequency || 'weekly';
    const target = channel.targetTasks !== undefined ? channel.targetTasks : 3;
    
    let filteredTasks = [];
    let periodText = '';
    
    if (freq === 'daily') {
      filteredTasks = videos.filter(v => v.scheduledDate === today);
      periodText = 'Today';
    } else {
      filteredTasks = videos.filter(v => v.scheduledDate >= week.start && v.scheduledDate <= week.end);
      periodText = 'This Week';
    }

    // Sort tasks: pending/uncompleted first, completed (done) last
    filteredTasks.sort((a, b) => {
      const isDoneA = a.status === 'done' ? 1 : 0;
      const isDoneB = b.status === 'done' ? 1 : 0;
      if (isDoneA !== isDoneB) {
        return isDoneA - isDoneB;
      }
      return new Date(a.scheduledDate) - new Date(b.scheduledDate);
    });

    const completedCount = filteredTasks.filter(t => t.status === 'done').length;
    const tasksLeft = Math.max(0, target - completedCount);

    const initial = channel.channelName ? channel.channelName.charAt(0).toUpperCase() : 'Y';
    const gradient = getGradientStyle(channel.channelName || 'Youtube');

    let displayUrl = channel.youtubeUrl || '';
    if (displayUrl.length > 32) {
      displayUrl = displayUrl.substring(0, 30) + '...';
    }

    return `
      <div class="channel-card ${channel.isBlocked ? 'blocked' : ''}" data-id="${channel.id}">
        <div>
          <div class="card-top">
            <div class="channel-info-wrapper">
              <div class="channel-avatar" style="${gradient}">
                ${initial}
              </div>
              <div class="channel-detail-info">
                <div style="display:flex; align-items:center; gap: 0.35rem;">
                  <h3 class="channel-card-title">${channel.channelName}</h3>
                  <button class="btn-card-edit-settings" data-id="${channel.id}" aria-label="Channel Settings">
                    <i data-lucide="settings"></i>
                  </button>
                </div>
                ${channel.youtubeUrl ? `
                  <a href="${channel.youtubeUrl}" target="_blank" class="channel-yt-link" rel="noopener noreferrer">
                    <i data-lucide="external-link"></i> ${displayUrl}
                  </a>
                ` : `
                  <span class="channel-yt-link"><i data-lucide="link-2"></i> No URL</span>
                `}
              </div>
            </div>
            <span class="badge ${badgeClass}">
              <i data-lucide="${badgeIcon}"></i> ${badgeLabel}
            </span>
          </div>

          <!-- Target Tasks Left and Checklist section inside Card -->
          <div class="channel-card-tasks">
            <div class="channel-card-tasks-header">
              <span class="tasks-left-label">Tasks for ${periodText}${freq === 'weekly' ? ` (${getDaysLeftInWeek(week.endDateObj)})` : ''}:</span>
              <span class="tasks-left-badge ${tasksLeft === 0 ? 'completed-badge' : ''}">
                ${tasksLeft === 0 ? '<i data-lucide="check" style="width:10px;height:10px;display:inline;"></i> Done' : `${tasksLeft} Left (Goal: ${target})`}
              </span>
            </div>
            
            <div class="channel-card-task-list">
              ${filteredTasks.length === 0 ? `
                <div class="empty-state" style="padding: 1rem 0.5rem; border-style: solid; background: transparent; border-width: 1px;">
                  <span class="empty-state-text" style="font-size: 0.75rem;">No tasks scheduled for ${periodText.toLowerCase()}.</span>
                </div>
              ` : filteredTasks.map(task => {
                const isCompleted = task.status === 'done';
                const taskDate = new Date(task.scheduledDate + 'T00:00:00');
                const formattedDate = taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return `
                  <div class="channel-card-task-row ${isCompleted ? 'completed' : ''}" data-video-id="${task.id}" data-channel-id="${channel.id}">
                    <input type="checkbox" class="task-checkbox channel-card-checkbox" data-video-id="${task.id}" data-channel-id="${channel.id}" ${isCompleted ? 'checked' : ''} ${channel.isBlocked ? 'disabled' : ''} style="width:15px;height:15px;">
                    <span class="channel-card-task-text">${task.title}</span>
                    <span class="channel-card-task-date">${formattedDate}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        <div class="card-actions" style="margin-top: 0; padding-top: 0.75rem; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn-card-action" onclick="window.location.hash='#workshop/${channel.id}'">
            <i data-lucide="briefcase"></i> Open Workshop
          </button>
          <button class="btn-card-action btn-card-auto-schedule" data-id="${channel.id}" title="Auto-Schedule Videos" ${channel.isBlocked ? 'disabled' : ''}>
            <i data-lucide="calendar-plus"></i> Auto-Schedule
          </button>
          <button class="btn-card-action btn-card-block" data-id="${channel.id}" title="${channel.isBlocked ? 'Unblock Channel' : 'Block Channel'}">
            <i data-lucide="${channel.isBlocked ? 'unlock' : 'ban'}"></i> ${channel.isBlocked ? 'Unblock' : 'Block'}
          </button>
          <button class="btn-card-delete" data-id="${channel.id}" aria-label="Delete Channel">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  });

  const cardsHtmlArray = await Promise.all(cardsHtmlPromise);
  grid.innerHTML = cardsHtmlArray.join('');
  lucide.createIcons();

  // Attach delete channel listeners
  grid.querySelectorAll('.btn-card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const channelId = btn.dataset.id;
      const channel = state.channels.find(c => c.id === channelId);
      
      const confirmDelete = confirm(`Are you sure you want to delete "${channel.channelName}"? All its videos, topics, and resource links will be permanently deleted!`);
      if (confirmDelete) {
        try {
          renderLoading('app-container', 'Deleting channel and cleansing datasets...');
          await deleteChannel(state.currentUser.uid, channelId);
          showToast(`Deleted channel "${channel.channelName}"!`, 'success');
          renderDashboard();
        } catch (error) {
          renderDashboard();
          showToast(`Failed to delete channel: ${error.message}`, 'error');
        }
      }
    });
  });

  // Attach channel edit settings listeners
  grid.querySelectorAll('.btn-card-edit-settings').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const channelId = btn.dataset.id;
      const channel = state.channels.find(c => c.id === channelId);
      openEditChannelModal(channel);
    });
  });

  // Attach manual auto-scheduling listeners
  grid.querySelectorAll('.btn-card-auto-schedule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const channelId = btn.dataset.id;
      const channel = state.channels.find(c => c.id === channelId);
      if (channel.isBlocked) return;
      openAutoScheduleModal(channel);
    });
  });

  // Attach block channel listeners
  grid.querySelectorAll('.btn-card-block').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const channelId = btn.dataset.id;
      const channel = state.channels.find(c => c.id === channelId);
      const newBlockedState = !channel.isBlocked;
      
      try {
        renderLoading('app-container', newBlockedState ? 'Blocking channel...' : 'Unblocking channel...');
        await updateChannel(state.currentUser.uid, channelId, { isBlocked: newBlockedState });
        showToast(newBlockedState ? `Blocked channel "${channel.channelName}"!` : `Unblocked channel "${channel.channelName}"!`, 'success');
        renderDashboard();
      } catch (error) {
        renderDashboard();
        showToast(`Failed to update channel block status: ${error.message}`, 'error');
      }
    });
  });

  // Attach task checkbox click listeners (nested within the channel cards)
  grid.querySelectorAll('.channel-card-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const videoId = cb.dataset.videoId;
      const channelId = cb.dataset.channelId;
      const newStatus = cb.checked ? 'done' : 'pending';
      
      try {
        await updateVideoStatus(state.currentUser.uid, channelId, videoId, newStatus);
        showToast(newStatus === 'done' ? 'Upload marked as Completed!' : 'Upload marked as Pending.', 'success');
        
        // Immediate visual feedback animation within the specific card
        const row = grid.querySelector(`.channel-card-task-row[data-video-id="${videoId}"]`);
        if (newStatus === 'done') {
          row.classList.add('completed');
        } else {
          row.classList.remove('completed');
        }
        
        // Re-render dashboard after a small delay to update target counts and badge colors
        setTimeout(() => renderDashboard(), 400);
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
        cb.checked = !cb.checked; // Revert checkbox state
      }
    });
  });
}

function openAddChannelModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-channel-modal';
  
  overlay.innerHTML = `
    <div class="modal-content animate-fade-in">
      <div class="modal-header">
        <h3 class="modal-title">Add YouTube Channel</h3>
        <button class="btn-modal-close" id="close-modal-btn"><i data-lucide="x"></i></button>
      </div>
      <form id="add-channel-form">
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="modal-channel-name">Channel Name</label>
          <div class="input-wrapper">
            <i data-lucide="tv" class="input-icon"></i>
            <input type="text" id="modal-channel-name" class="form-input" style="padding-left: 2.5rem;" placeholder="e.g. Linus Tech Tips" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="modal-channel-url">YouTube URL</label>
          <div class="input-wrapper">
            <i data-lucide="link" class="input-icon"></i>
            <input type="url" id="modal-channel-url" class="form-input" style="padding-left: 2.5rem;" placeholder="e.g. https://youtube.com/@linustech" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="modal-channel-frequency">Upload Goal Target</label>
            <select id="modal-channel-frequency" class="select-styled" style="width: 100%; height: 42px;" required>
              <option value="weekly">Weekly Tasks</option>
              <option value="daily">Daily Tasks</option>
            </select>
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="modal-channel-targets">Target Upload Count</label>
            <div class="input-wrapper">
              <i data-lucide="target" class="input-icon"></i>
              <input type="number" id="modal-channel-targets" class="form-input" style="padding-left: 2.5rem; height: 42px;" min="1" max="30" value="3" required>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancel-modal-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Channel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => {
    overlay.remove();
  };

  document.getElementById('close-modal-btn').addEventListener('click', close);
  document.getElementById('cancel-modal-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('add-channel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('modal-channel-name').value.trim();
    const url = document.getElementById('modal-channel-url').value.trim();
    const freq = document.getElementById('modal-channel-frequency').value;
    const targets = Number(document.getElementById('modal-channel-targets').value);

    // Subtle validation for YouTube url
    if (!url.startsWith('https://') && !url.includes('youtube.com') && !url.includes('youtu.be')) {
      showToast('Please enter a valid YouTube channel URL.', 'warning');
      return;
    }

    try {
      close();
      renderLoading('app-container', 'Saving channel...');
      const newChan = await addChannel(state.currentUser.uid, name, url, freq, targets);
      showToast(`Added channel "${name}"!`, 'success');
      openAutoScheduleModal(newChan, () => {
        renderDashboard();
      });
    } catch (error) {
      renderDashboard();
      showToast(`Failed to add channel: ${error.message}`, 'error');
    }
  });
}

function openEditChannelModal(channel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'edit-channel-modal';
  
  const frequency = channel.frequency || 'weekly';
  const targetTasks = channel.targetTasks !== undefined ? channel.targetTasks : 3;

  overlay.innerHTML = `
    <div class="modal-content animate-fade-in">
      <div class="modal-header">
        <h3 class="modal-title">Channel Settings</h3>
        <button class="btn-modal-close" id="close-edit-modal-btn"><i data-lucide="x"></i></button>
      </div>
      <form id="edit-channel-form">
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="edit-channel-name">Channel Name</label>
          <div class="input-wrapper">
            <i data-lucide="tv" class="input-icon"></i>
            <input type="text" id="edit-channel-name" class="form-input" style="padding-left: 2.5rem;" value="${channel.channelName}" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="edit-channel-url">YouTube URL</label>
          <div class="input-wrapper">
            <i data-lucide="link" class="input-icon"></i>
            <input type="url" id="edit-channel-url" class="form-input" style="padding-left: 2.5rem;" value="${channel.youtubeUrl || ''}" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="edit-channel-frequency">Upload Goal Target</label>
            <select id="edit-channel-frequency" class="select-styled" style="width: 100%; height: 42px;" required>
              <option value="daily" ${frequency === 'daily' ? 'selected' : ''}>Daily Tasks</option>
              <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>Weekly Tasks</option>
            </select>
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="edit-channel-targets">Target Upload Count</label>
            <div class="input-wrapper">
              <i data-lucide="target" class="input-icon"></i>
              <input type="number" id="edit-channel-targets" class="form-input" style="padding-left: 2.5rem; height: 42px;" min="1" max="30" value="${targetTasks}" required>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label class="toggle-switch-wrapper">
            <input type="checkbox" id="edit-channel-blocked" class="toggle-switch-input" ${channel.isBlocked ? 'checked' : ''}>
            <span class="toggle-switch"></span>
            <span class="toggle-label">Block this channel (disables scheduling)</span>
          </label>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancel-edit-modal-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Settings</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => overlay.remove();
  document.getElementById('close-edit-modal-btn').addEventListener('click', close);
  document.getElementById('cancel-edit-modal-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('edit-channel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('edit-channel-name').value.trim();
    const url = document.getElementById('edit-channel-url').value.trim();
    const freq = document.getElementById('edit-channel-frequency').value;
    const targets = Number(document.getElementById('edit-channel-targets').value);
    const isBlocked = document.getElementById('edit-channel-blocked').checked;

    if (!url.startsWith('https://') && !url.includes('youtube.com') && !url.includes('youtu.be')) {
      showToast('Please enter a valid YouTube channel URL.', 'warning');
      return;
    }

    try {
      close();
      renderLoading('app-container', 'Updating channel settings...');
      await updateChannel(state.currentUser.uid, channel.id, {
        channelName: name,
        youtubeUrl: url,
        frequency: freq,
        targetTasks: targets,
        isBlocked: isBlocked
      });
      showToast(`Updated settings for "${name}"!`, 'success');
      
      if (!isBlocked && (channel.frequency !== freq || channel.targetTasks !== targets)) {
        const updatedChannel = { ...channel, channelName: name, youtubeUrl: url, frequency: freq, targetTasks: targets, isBlocked: isBlocked };
        openAutoScheduleModal(updatedChannel, () => {
          renderDashboard();
        });
      } else {
        renderDashboard();
      }
    } catch (err) {
      renderDashboard();
      showToast(`Failed to update channel: ${err.message}`, 'error');
    }
  });
}

// ==========================================================================
// View Engine: Progress Calendar View
// ==========================================================================
async function renderCalendar() {
  renderLoading('app-container', 'Loading calendar schedule...');

  // Ensure channels are loaded
  if (state.channels.length === 0) {
    try {
      state.channels = await getChannels(state.currentUser.uid);
    } catch (e) {
      console.error(e);
    }
  }

  // Fetch videos for calendar based on filter
  try {
    if (state.calendarFilter === 'all') {
      const videoFetchPromises = state.channels.map(async (c) => {
        const vids = await getVideos(state.currentUser.uid, c.id);
        return vids.map(v => ({ ...v, channelId: c.id, channelName: c.channelName }));
      });
      const vidsArray = await Promise.all(videoFetchPromises);
      state.allVideos = vidsArray.flat();
    } else {
      const c = state.channels.find(chan => chan.id === state.calendarFilter);
      if (c) {
        const vids = await getVideos(state.currentUser.uid, c.id);
        state.allVideos = vids.map(v => ({ ...v, channelId: c.id, channelName: c.channelName }));
      } else {
        state.allVideos = [];
      }
    }
  } catch (error) {
    showToast('Failed to load video schedules.', 'error');
  }

  const container = document.getElementById('app-container');
  container.innerHTML = `
    <div class="view-header animate-fade-in">
      <div class="view-title-group">
        <h2>Progress Calendar</h2>
        <p class="view-description">Plan upload schedules and toggle statuses (done / pending / skipped).</p>
      </div>
      <button class="btn btn-primary" id="schedule-video-btn" ${state.channels.filter(c => !c.isBlocked).length === 0 ? 'disabled' : ''}>
        <i data-lucide="calendar-plus"></i> Schedule Video
      </button>
    </div>

    <!-- Calendar Controls -->
    <div class="calendar-controls animate-fade-in">
      <div class="calendar-control-left">
        <div class="calendar-toggle-btn">
          <button id="toggle-month-view" class="${state.calendarView === 'month' ? 'active' : ''}">Month</button>
          <button id="toggle-week-view" class="${state.calendarView === 'week' ? 'active' : ''}">Week</button>
        </div>
        
        <div class="calendar-date-nav">
          <button class="btn btn-outline btn-sm" id="cal-nav-prev"><i data-lucide="chevron-left"></i></button>
          <button class="btn btn-outline btn-sm" id="cal-nav-today">Today</button>
          <button class="btn btn-outline btn-sm" id="cal-nav-next"><i data-lucide="chevron-right"></i></button>
        </div>
        
        <span class="calendar-current-label" id="calendar-current-label"></span>
      </div>

      <div class="calendar-control-right">
        <label class="form-label" style="margin-bottom:0; font-weight:500;">Filter Channel:</label>
        <select class="select-styled" id="calendar-channel-filter">
          <option value="all" ${state.calendarFilter === 'all' ? 'selected' : ''}>All Channels</option>
          ${state.channels.map(c => `
            <option value="${c.id}" ${state.calendarFilter === c.id ? 'selected' : ''}>${c.channelName}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <!-- Grid Container -->
    <div class="calendar-view-container animate-fade-in" id="calendar-view-container">
      <!-- Dynamic Weekday/Days Grids render here -->
    </div>
  `;

  // Attach controls listeners
  document.getElementById('toggle-month-view').addEventListener('click', () => {
    state.calendarView = 'month';
    renderCalendar();
  });
  document.getElementById('toggle-week-view').addEventListener('click', () => {
    state.calendarView = 'week';
    renderCalendar();
  });

  document.getElementById('cal-nav-prev').addEventListener('click', () => {
    adjustCalendarDate(-1);
    renderCalendar();
  });
  document.getElementById('cal-nav-next').addEventListener('click', () => {
    adjustCalendarDate(1);
    renderCalendar();
  });
  document.getElementById('cal-nav-today').addEventListener('click', () => {
    state.calendarDate = new Date();
    renderCalendar();
  });

  document.getElementById('calendar-channel-filter').addEventListener('change', (e) => {
    state.calendarFilter = e.target.value;
    renderCalendar();
  });

  if (state.channels.length > 0) {
    document.getElementById('schedule-video-btn').addEventListener('click', openScheduleVideoModal);
  }

  // Draw appropriate view
  if (state.calendarView === 'month') {
    drawMonthGrid();
  } else {
    drawWeekGrid();
  }
  lucide.createIcons();
}

function adjustCalendarDate(direction) {
  const d = new Date(state.calendarDate);
  if (state.calendarView === 'month') {
    d.setMonth(d.getMonth() + direction);
  } else {
    d.setDate(d.getDate() + (direction * 7));
  }
  state.calendarDate = d;
}

function drawMonthGrid() {
  const container = document.getElementById('calendar-view-container');
  const date = state.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  // Set Label
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('calendar-current-label').textContent = `${monthNames[month]} ${year}`;

  // Weekdays header
  let html = `
    <div class="calendar-weekdays-grid">
      <div class="calendar-weekday">Sun</div>
      <div class="calendar-weekday">Mon</div>
      <div class="calendar-weekday">Tue</div>
      <div class="calendar-weekday">Wed</div>
      <div class="calendar-weekday">Thu</div>
      <div class="calendar-weekday">Fri</div>
      <div class="calendar-weekday">Sat</div>
    </div>
    <div class="calendar-days-grid">
  `;

  // Start building days.
  // First day of current month:
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0-6

  // Grid start is first day minus offset to Sunday
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDayOfWeek);

  const todayStr = getTodayStr();

  // Render 42 cells (6 weeks)
  for (let i = 0; i < 42; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);

    const isOtherMonth = current.getMonth() !== month;
    const isToday = current.getFullYear() === new Date().getFullYear() &&
                    current.getMonth() === new Date().getMonth() &&
                    current.getDate() === new Date().getDate();

    // Format to YYYY-MM-DD
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const dayVal = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${dayVal}`;

    // Filter videos scheduled for this day
    const dayVideos = state.allVideos.filter(v => v.scheduledDate === dateStr);

    html += `
      <div class="calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}">
        <span class="calendar-day-number">${current.getDate()}</span>
        <div class="calendar-events-container">
          ${dayVideos.map(video => {
            let statusClass = 'calendar-event-pending';
            let icon = 'clock';
            if (video.status === 'done') {
              statusClass = 'calendar-event-done';
              icon = 'check-circle';
            } else if (video.status === 'skipped') {
              statusClass = 'calendar-event-skipped';
              icon = 'x-circle';
            }
            return `
              <div class="calendar-event ${statusClass}" data-video-id="${video.id}" data-channel-id="${video.channelId}">
                <i data-lucide="${icon}" style="width: 10px; height: 10px; flex-shrink: 0;"></i>
                <span style="overflow: hidden; text-overflow: ellipsis;">${video.channelName}: ${video.title}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
  lucide.createIcons();

  // Attach event click handlers
  container.querySelectorAll('.calendar-event').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const videoId = el.dataset.videoId;
      const channelId = el.dataset.channelId;
      openVideoActionModal(videoId, channelId);
    });
  });
}

function drawWeekGrid() {
  const container = document.getElementById('calendar-view-container');
  const date = state.calendarDate;
  const week = getWeekRange(date);

  // Set Label
  const startMonth = week.startDateObj.toLocaleDateString('en-US', { month: 'short' });
  const startDay = week.startDateObj.getDate();
  const endMonth = week.endDateObj.toLocaleDateString('en-US', { month: 'short' });
  const endDay = week.endDateObj.getDate();
  const year = week.startDateObj.getFullYear();
  
  const label = startMonth === endMonth ? 
    `${startMonth} ${startDay} - ${endDay}, ${year}` : 
    `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  
  document.getElementById('calendar-current-label').textContent = label;

  let html = `
    <div class="calendar-weekdays-grid">
      <div class="calendar-weekday">Mon</div>
      <div class="calendar-weekday">Tue</div>
      <div class="calendar-weekday">Wed</div>
      <div class="calendar-weekday">Thu</div>
      <div class="calendar-weekday">Fri</div>
      <div class="calendar-weekday">Sat</div>
      <div class="calendar-weekday">Sun</div>
    </div>
    <div class="calendar-week-grid">
  `;

  const todayStr = getTodayStr();

  // Render 7 columns (Mon-Sun)
  for (let i = 0; i < 7; i++) {
    const current = new Date(week.startDateObj);
    current.setDate(week.startDateObj.getDate() + i);

    const isToday = current.getFullYear() === new Date().getFullYear() &&
                    current.getMonth() === new Date().getMonth() &&
                    current.getDate() === new Date().getDate();

    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const dayVal = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${dayVal}`;

    const dayVideos = state.allVideos.filter(v => v.scheduledDate === dateStr);

    html += `
      <div class="calendar-week-day-cell ${isToday ? 'today' : ''}">
        <span class="calendar-day-number" style="font-weight:700;">${current.getDate()}</span>
        <div class="calendar-week-events-container">
          ${dayVideos.map(video => {
            let statusClass = 'calendar-event-pending';
            let statusText = 'Pending';
            if (video.status === 'done') {
              statusClass = 'calendar-event-done';
              statusText = 'Uploaded';
            } else if (video.status === 'skipped') {
              statusClass = 'calendar-event-skipped';
              statusText = 'Skipped';
            }
            return `
              <div class="calendar-week-event ${statusClass}" data-video-id="${video.id}" data-channel-id="${video.channelId}">
                <div style="font-size:0.7rem; font-weight:600; text-transform:uppercase; opacity:0.8;">${video.channelName}</div>
                <div style="font-size:0.85rem; font-weight:700; margin: 0.15rem 0;">${video.title}</div>
                <div style="font-size:0.7rem; font-weight:500;">Status: ${statusText}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
  lucide.createIcons();

  // Attach event click handlers
  container.querySelectorAll('.calendar-week-event').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const videoId = el.dataset.videoId;
      const channelId = el.dataset.channelId;
      openVideoActionModal(videoId, channelId);
    });
  });
}

function openScheduleVideoModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'schedule-video-modal';
  
  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 450px;">
      <div class="modal-header">
        <h3 class="modal-title">Schedule Video Upload</h3>
        <button class="btn-modal-close" id="close-sched-modal-btn"><i data-lucide="x"></i></button>
      </div>
      <form id="schedule-video-form">
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="sched-channel-select">Select Channel</label>
          <select id="sched-channel-select" class="select-styled" style="width:100%;" required>
            ${state.channels.filter(c => !c.isBlocked).map(c => `<option value="${c.id}">${c.channelName}</option>`).join('')}
          </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="sched-video-title">Video Title</label>
          <div class="input-wrapper">
            <i data-lucide="file-video" class="input-icon"></i>
            <input type="text" id="sched-video-title" class="form-input" style="padding-left: 2.5rem;" placeholder="e.g. 10 Secret Tech Tips!" required>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 1.75rem;">
          <label class="form-label" for="sched-video-date">Scheduled Date</label>
          <div class="input-wrapper">
            <i data-lucide="calendar" class="input-icon"></i>
            <input type="date" id="sched-video-date" class="form-input" style="padding-left: 2.5rem;" value="${getTodayStr()}" required>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancel-sched-modal-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Schedule Video</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => overlay.remove();
  document.getElementById('close-sched-modal-btn').addEventListener('click', close);
  document.getElementById('cancel-sched-modal-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('schedule-video-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const channelId = document.getElementById('sched-channel-select').value;
    const title = document.getElementById('sched-video-title').value.trim();
    const dateStr = document.getElementById('sched-video-date').value;

    try {
      close();
      renderLoading('app-container', 'Scheduling video upload...');
      await addVideo(state.currentUser.uid, channelId, title, dateStr);
      showToast(`Scheduled "${title}" successfully!`, 'success');
      renderCalendar();
    } catch (err) {
      renderCalendar();
      showToast(`Failed to schedule video: ${err.message}`, 'error');
    }
  });
}

function openVideoActionModal(videoId, channelId) {
  const video = state.allVideos.find(v => v.id === videoId && v.channelId === channelId);
  if (!video) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'video-action-modal';

  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 400px; gap: 1rem;">
      <div class="modal-header">
        <h3 class="modal-title">Update Upload Status</h3>
        <button class="btn-modal-close" id="close-action-modal"><i data-lucide="x"></i></button>
      </div>
      <div>
        <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">${video.title}</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
          Channel: <strong>${video.channelName}</strong><br>
          Scheduled Date: ${video.scheduledDate}
        </p>
        
        <div class="form-group">
          <label class="form-label">Set Upload Status:</label>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top:0.5rem;">
            <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; border-color: rgba(22, 163, 74, 0.2);" id="set-done-btn">
              <span class="badge badge-green"><i data-lucide="check-circle"></i> Uploaded / Done</span>
            </button>
            <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; border-color: rgba(202, 138, 4, 0.2);" id="set-pending-btn">
              <span class="badge badge-yellow"><i data-lucide="clock"></i> Pending / Due</span>
            </button>
            <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; border-color: rgba(220, 38, 38, 0.2);" id="set-skipped-btn">
              <span class="badge badge-red"><i data-lucide="x-circle"></i> Skipped</span>
            </button>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="justify-content: space-between; border-top:1px solid var(--border-color); padding-top: 1rem;">
        <button type="button" class="btn btn-outline-danger btn-sm" id="delete-video-btn">
          <i data-lucide="trash-2"></i> Delete Schedule
        </button>
        <button type="button" class="btn btn-outline btn-sm" id="cancel-action-modal">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => overlay.remove();
  document.getElementById('close-action-modal').addEventListener('click', close);
  document.getElementById('cancel-action-modal').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const updateStatus = async (status) => {
    try {
      close();
      renderLoading('app-container', 'Updating status...');
      await updateVideoStatus(state.currentUser.uid, channelId, videoId, status);
      showToast(`Updated status to ${status}!`, 'success');
      renderCalendar();
    } catch (e) {
      renderCalendar();
      showToast(`Failed to update status: ${e.message}`, 'error');
    }
  };

  document.getElementById('set-done-btn').addEventListener('click', () => updateStatus('done'));
  document.getElementById('set-pending-btn').addEventListener('click', () => updateStatus('pending'));
  document.getElementById('set-skipped-btn').addEventListener('click', () => updateStatus('skipped'));

  document.getElementById('delete-video-btn').addEventListener('click', async () => {
    if (confirm(`Remove this video "${video.title}" from the calendar schedule?`)) {
      try {
        close();
        renderLoading('app-container', 'Removing schedule...');
        await deleteVideo(state.currentUser.uid, channelId, videoId);
        showToast('Video schedule deleted!', 'success');
        renderCalendar();
      } catch (e) {
        renderCalendar();
        showToast(`Failed to delete: ${e.message}`, 'error');
      }
    }
  });
}

// ==========================================================================
// View Engine: Channel Workshop View
// ==========================================================================
async function renderWorkshop(channelId) {
  renderLoading('app-container', 'Entering Channel Workshop...');

  // Load target channel details
  if (state.channels.length === 0) {
    try {
      state.channels = await getChannels(state.currentUser.uid);
    } catch (e) {
      console.error(e);
    }
  }

  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) {
    showToast('Channel not found or you do not have permission to view it.', 'error');
    window.location.hash = '#dashboard';
    return;
  }

  state.activeChannel = channel;

  // Load all workshop data for this channel in parallel
  let topics = [];
  let imageResources = [];
  let scriptResources = [];

  try {
    const [tList, imgList, scrList] = await Promise.all([
      getTopics(state.currentUser.uid, channelId),
      getImageResources(state.currentUser.uid, channelId),
      getScriptResources(state.currentUser.uid, channelId)
    ]);
    topics = tList;
    imageResources = imgList;
    scriptResources = scrList;
  } catch (err) {
    showToast('Failed to load workshop resources.', 'error');
  }

  const gradient = getGradientStyle(channel.channelName);
  const initial = channel.channelName ? channel.channelName.charAt(0).toUpperCase() : 'Y';

  const container = document.getElementById('app-container');
  container.innerHTML = `
    <!-- Back Button -->
    <a href="#dashboard" class="btn btn-outline btn-sm workshop-back-btn animate-fade-in">
      <i data-lucide="arrow-left"></i> Back to Dashboard
    </a>

    <!-- Channel Banner Header -->
    <div class="workshop-header-banner animate-fade-in">
      <div class="workshop-channel-details">
        <div class="channel-avatar" style="${gradient} width: 56px; height: 56px; font-size: 1.5rem; border-radius: var(--radius-lg);">
          ${initial}
        </div>
        <div class="workshop-title-group">
          <h2>${channel.channelName} Workshop</h2>
          ${channel.youtubeUrl ? `
            <a href="${channel.youtubeUrl}" target="_blank" class="channel-yt-link" rel="noopener noreferrer" style="font-size: 0.9rem;">
              <i data-lucide="youtube" style="color: #ff0000; fill: #ff0000;"></i> Open YouTube Channel
            </a>
          ` : `
            <span class="channel-yt-link" style="font-size: 0.9rem;"><i data-lucide="link"></i> No URL Configured</span>
          `}
        </div>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button class="btn btn-outline" id="auto-schedule-workshop-btn" ${channel.isBlocked ? 'disabled' : ''}>
          <i data-lucide="calendar-plus"></i> Auto-Schedule
        </button>
        <button class="btn btn-primary" id="add-topic-btn">
          <i data-lucide="lightbulb"></i> Add Topic Idea
        </button>
      </div>
    </div>

    <!-- Workshop Contents Layout Grid -->
    <div class="workshop-grid animate-fade-in">
      
      <!-- Topic Bucket (Column 1) -->
      <div class="workshop-card">
        <div class="workshop-card-header">
          <h3 class="workshop-card-title"><i data-lucide="inbox"></i> Topic Bucket</h3>
          <span class="badge badge-green" style="font-weight: 500;">
            ${topics.filter(t => !t.isUsed).length} Available
          </span>
        </div>
        
        <div class="topic-list" id="topic-list">
          ${topics.length === 0 ? `
            <div class="empty-state">
              <i data-lucide="lightbulb-off"></i>
              <span class="empty-state-text">No topics in the bucket. Add video concepts!</span>
            </div>
          ` : topics.map(topic => `
            <div class="topic-item ${topic.isUsed ? 'used' : ''}" data-topic-id="${topic.id}">
              <div class="topic-header">
                <span class="topic-title" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                  ${topic.title}
                  <button class="btn-copy-text" data-text="${topic.title.replace(/"/g, '&quot;')}" title="Copy Topic Title" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.15rem; display: inline-flex; align-items: center;">
                    <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
                  </button>
                </span>
                <div class="topic-actions">
                  <button class="btn-icon btn-edit-topic" data-topic-id="${topic.id}" aria-label="Edit Topic">
                    <i data-lucide="edit-3"></i>
                  </button>
                  <button class="btn-icon btn-icon-danger btn-delete-topic" data-topic-id="${topic.id}" aria-label="Delete Topic">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>
              
              ${topic.notes ? `
                <div class="topic-notes" style="position: relative; padding-right: 2rem;">
                  ${topic.notes}
                  <button class="btn-copy-text" data-text="${topic.notes.replace(/"/g, '&quot;')}" title="Copy Description" style="position: absolute; right: 0.5rem; top: 0.5rem; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; display: inline-flex; align-items: center;">
                    <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
                  </button>
                </div>
              ` : ''}

              <div class="topic-footer">
                <span class="topic-date">Added: ${new Date(topic.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <label class="toggle-switch-wrapper">
                  <input type="checkbox" class="toggle-switch-input topic-used-checkbox" data-topic-id="${topic.id}" ${topic.isUsed ? 'checked' : ''}>
                  <span class="toggle-switch"></span>
                  <span class="toggle-label">${topic.isUsed ? 'Used' : 'Available'}</span>
                </label>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Resource Directories (Column 2) -->
      <div style="display: flex; flex-direction: column; gap: 2rem;">
        
        <!-- Image Sources -->
        <div class="workshop-card">
          <div class="workshop-card-header">
            <h3 class="workshop-card-title"><i data-lucide="image"></i> Image Sources</h3>
            <button class="btn btn-outline btn-sm" id="add-img-resource-btn">
              <i data-lucide="plus"></i> Add Link
            </button>
          </div>
          
          <div class="resource-list" id="image-resource-list">
            ${imageResources.length === 0 ? `
              <div class="empty-state" style="padding: 1.5rem 1rem;">
                <i data-lucide="link-2"></i>
                <span class="empty-state-text">No image asset folder or URL linked.</span>
              </div>
            ` : imageResources.map(res => `
              <div class="resource-item" data-id="${res.id}">
                <div class="resource-info">
                  <span class="resource-label">${res.label}</span>
                  <a href="${res.url}" target="_blank" class="resource-url-wrapper" rel="noopener noreferrer">
                    <i data-lucide="external-link"></i> Open Link
                  </a>
                </div>
                <div class="resource-actions">
                  <button class="btn-icon btn-edit-resource" data-id="${res.id}" data-type="image" aria-label="Edit Link">
                    <i data-lucide="edit-2"></i>
                  </button>
                  <button class="btn-icon btn-icon-danger btn-delete-resource" data-id="${res.id}" data-type="image" aria-label="Delete Link">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Content & Script Tools -->
        <div class="workshop-card">
          <div class="workshop-card-header">
            <h3 class="workshop-card-title"><i data-lucide="file-text"></i> Script & Research Tools</h3>
            <button class="btn btn-outline btn-sm" id="add-scr-resource-btn">
              <i data-lucide="plus"></i> Add Link
            </button>
          </div>
          
          <div class="resource-list" id="script-resource-list">
            ${scriptResources.length === 0 ? `
              <div class="empty-state" style="padding: 1.5rem 1rem;">
                <i data-lucide="link-2"></i>
                <span class="empty-state-text">No content templates or AI scripts linked.</span>
              </div>
            ` : scriptResources.map(res => `
              <div class="resource-item" data-id="${res.id}">
                <div class="resource-info">
                  <span class="resource-label">${res.label}</span>
                  <a href="${res.url}" target="_blank" class="resource-url-wrapper" rel="noopener noreferrer">
                    <i data-lucide="external-link"></i> Open Link
                  </a>
                </div>
                <div class="resource-actions">
                  <button class="btn-icon btn-edit-resource" data-id="${res.id}" data-type="script" aria-label="Edit Link">
                    <i data-lucide="edit-2"></i>
                  </button>
                  <button class="btn-icon btn-icon-danger btn-delete-resource" data-id="${res.id}" data-type="script" aria-label="Delete Link">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </div>
  `;
  lucide.createIcons();

  // Attach Topic Event Handlers
  document.getElementById('add-topic-btn').addEventListener('click', () => openTopicModal(null, channelId));
  
  const autoSchedWorkshopBtn = document.getElementById('auto-schedule-workshop-btn');
  if (autoSchedWorkshopBtn) {
    autoSchedWorkshopBtn.addEventListener('click', () => {
      if (channel.isBlocked) return;
      openAutoScheduleModal(channel);
    });
  }
  
  container.querySelectorAll('.btn-edit-topic').forEach(btn => {
    btn.addEventListener('click', () => {
      const topicId = btn.dataset.topicId;
      const topicObj = topics.find(t => t.id === topicId);
      openTopicModal(topicObj, channelId);
    });
  });

  container.querySelectorAll('.btn-delete-topic').forEach(btn => {
    btn.addEventListener('click', async () => {
      const topicId = btn.dataset.topicId;
      if (confirm('Delete this topic idea?')) {
        try {
          renderLoading('app-container', 'Deleting topic concept...');
          await deleteTopic(state.currentUser.uid, channelId, topicId);
          showToast('Topic deleted!', 'success');
          renderWorkshop(channelId);
        } catch (e) {
          renderWorkshop(channelId);
          showToast(`Failed to delete topic: ${e.message}`, 'error');
        }
      }
    });
  });

  container.querySelectorAll('.topic-used-checkbox').forEach(box => {
    box.addEventListener('change', async () => {
      const topicId = box.dataset.topicId;
      const isChecked = box.checked;
      try {
        await updateTopic(state.currentUser.uid, channelId, topicId, { isUsed: isChecked });
        showToast(isChecked ? 'Topic marked as Used!' : 'Topic marked as Available!', 'success');
        
        // Instant visual toggle feedback, then reload
        const item = container.querySelector(`.topic-item[data-topic-id="${topicId}"]`);
        if (isChecked) {
          item.classList.add('used');
          item.querySelector('.toggle-label').textContent = 'Used';
        } else {
          item.classList.remove('used');
          item.querySelector('.toggle-label').textContent = 'Available';
        }
        
        // Reload to maintain order/integrity
        renderWorkshop(channelId);
      } catch (e) {
        showToast(`Failed to toggle status: ${e.message}`, 'error');
        box.checked = !isChecked; // revert
      }
    });
  });

  // Attach Resource Link Event Handlers (Image and Script Directories)
  document.getElementById('add-img-resource-btn').addEventListener('click', () => openResourceModal(null, 'image', channelId));
  document.getElementById('add-scr-resource-btn').addEventListener('click', () => openResourceModal(null, 'script', channelId));

  container.querySelectorAll('.btn-edit-resource').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      const resObj = type === 'image' ? imageResources.find(r => r.id === id) : scriptResources.find(r => r.id === id);
      openResourceModal(resObj, type, channelId);
    });
  });

  container.querySelectorAll('.btn-delete-resource').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      if (confirm('Are you sure you want to remove this resource link?')) {
        try {
          renderLoading('app-container', 'Removing directory link...');
          if (type === 'image') {
            await deleteImageResource(state.currentUser.uid, channelId, id);
          } else {
            await deleteScriptResource(state.currentUser.uid, channelId, id);
          }
          showToast('Resource link removed!', 'success');
          renderWorkshop(channelId);
        } catch (e) {
          renderWorkshop(channelId);
          showToast(`Failed to delete resource: ${e.message}`, 'error');
        }
      }
    });
  });

  // Attach Copy to Clipboard handlers
  container.querySelectorAll('.btn-copy-text').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
        
        const icon = btn.querySelector('i');
        if (icon) {
          icon.setAttribute('data-lucide', 'check');
          lucide.createIcons();
          setTimeout(() => {
            icon.setAttribute('data-lucide', 'copy');
            lucide.createIcons();
          }, 1500);
        }
      } catch (err) {
        showToast('Failed to copy text.', 'error');
      }
    });
  });
}

function openTopicModal(topic = null, channelId) {
  const isEdit = topic !== null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'topic-modal';

  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 480px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit Topic Concept' : 'New Video Concept'}</h3>
        <button class="btn-modal-close" id="close-topic-modal"><i data-lucide="x"></i></button>
      </div>
      <form id="topic-form">
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="topic-form-title">Concept Title</label>
          <div class="input-wrapper">
            <i data-lucide="edit-3" class="input-icon"></i>
            <input type="text" id="topic-form-title" class="form-input" style="padding-left: 2.5rem;" placeholder="e.g. Setting Up My Desk Setup" value="${isEdit ? topic.title : ''}" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 1.75rem;">
          <label class="form-label" for="topic-form-notes">Optional Notes / Subtopics</label>
          <textarea id="topic-form-notes" class="form-input" style="padding: 0.65rem 1rem; min-height: 120px; font-family: inherit; resize: vertical;" placeholder="Add bullet points, script outline, or asset checklist...">${isEdit ? topic.notes : ''}</textarea>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancel-topic-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add to Bucket'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => overlay.remove();
  document.getElementById('close-topic-modal').addEventListener('click', close);
  document.getElementById('cancel-topic-modal').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('topic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('topic-form-title').value.trim();
    const notes = document.getElementById('topic-form-notes').value.trim();

    try {
      close();
      renderLoading('app-container', isEdit ? 'Updating concept...' : 'Adding topic...');
      if (isEdit) {
        await updateTopic(state.currentUser.uid, channelId, topic.id, { title, notes });
        showToast('Topic concept updated!', 'success');
      } else {
        await addTopic(state.currentUser.uid, channelId, title, notes);
        showToast('Concept added to bucket!', 'success');
      }
      renderWorkshop(channelId);
    } catch (err) {
      renderWorkshop(channelId);
      showToast(`Failed to save topic: ${err.message}`, 'error');
    }
  });
}

function openResourceModal(resource = null, type, channelId) {
  const isEdit = resource !== null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'resource-modal';

  overlay.innerHTML = `
    <div class="modal-content animate-fade-in" style="max-width: 440px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit Link' : 'Add Resource Link'}</h3>
        <button class="btn-modal-close" id="close-res-modal"><i data-lucide="x"></i></button>
      </div>
      <form id="resource-form">
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="res-form-label">Link Label</label>
          <div class="input-wrapper">
            <i data-lucide="tag" class="input-icon"></i>
            <input type="text" id="res-form-label" class="form-input" style="padding-left: 2.5rem;" placeholder="e.g. Drive Folder / Script Tool" value="${isEdit ? resource.label : ''}" required>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 1.75rem;">
          <label class="form-label" for="res-form-url">Link URL</label>
          <div class="input-wrapper">
            <i data-lucide="link" class="input-icon"></i>
            <input type="url" id="res-form-url" class="form-input" style="padding-left: 2.5rem;" placeholder="https://..." value="${isEdit ? resource.url : ''}" required>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancel-res-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Link'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons();

  const close = () => overlay.remove();
  document.getElementById('close-res-modal').addEventListener('click', close);
  document.getElementById('cancel-res-modal').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById('resource-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('res-form-label').value.trim();
    const url = document.getElementById('res-form-url').value.trim();

    try {
      close();
      renderLoading('app-container', 'Updating database directories...');
      
      if (type === 'image') {
        if (isEdit) {
          await updateImageResource(state.currentUser.uid, channelId, resource.id, { label, url });
          showToast('Image source updated!', 'success');
        } else {
          await addImageResource(state.currentUser.uid, channelId, label, url);
          showToast('Image link added!', 'success');
        }
      } else {
        if (isEdit) {
          await updateScriptResource(state.currentUser.uid, channelId, resource.id, { label, url });
          showToast('Script tool updated!', 'success');
        } else {
          await addScriptResource(state.currentUser.uid, channelId, label, url);
          showToast('Script link added!', 'success');
        }
      }
      
      renderWorkshop(channelId);
    } catch (err) {
      renderWorkshop(channelId);
      showToast(`Failed to save link: ${err.message}`, 'error');
    }
  });
}

// ==========================================================================
// App Initialization
// ==========================================================================
initAppRouter();
