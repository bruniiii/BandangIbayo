// The first-time walkthrough's steps (ui/Walkthrough.jsx). target = the menu
// item's label. Shown once per account on this device (key below).
export const walkthroughKey = (userId, role) => `ibayo:walkthrough-done:${role}:${userId || 'guest'}`;

export const JOINER_STEPS = [
  { title: 'Welcome to Bandang IBAYO!', body: "Here's a quick tour of the menu so you know where everything is. It takes less than a minute; you can skip it any time." },
  { target: 'HomePage', title: 'Homepage', body: 'Your next trip, how many tours you\'ve done, the calendar, tracking and the newest tour packages, all at a glance.' },
  { target: 'Feed', title: 'Feed', body: 'News from Bandang IBAYO: new tours, announcements, and posts from other joiners. Postponed or cancelled tours are posted here too.' },
  { target: 'Explore Tours', title: 'Explore Tours', body: 'Browse every open tour. Pick a date and a pickup point, then pay in full or with a downpayment through GCash or card.' },
  { target: 'My Bookings', title: 'My Bookings', body: 'Your receipts, QR code for check-in, things to bring, balance payments, cancellations, and your refunds.' },
  { target: 'Messages', title: 'Messages', body: 'Chat with your tour group and the team, and read messages from Bandang IBAYO.' },
  { target: 'Calendar', title: 'Calendar', body: 'Every tour by date. Tap an empty day to plan a Private Tour or request a new one.' },
  { target: 'Tracking', title: 'Tracking', body: 'On tour day, see the van live on the map and when it reaches your pickup point.' },
  { target: 'Private Tours', title: 'Private Tours', body: 'A private trip just for your group: send your destination, dates and budget, and we prepare a package.' },
  { target: 'Request a Tour', title: 'Request a Tour', body: "Suggest a destination we don't offer yet. If approved, it's posted for everyone to join." },
  { target: 'Reviews', title: 'Reviews', body: 'Rate a tour after you join it and read what other joiners say.' },
  { target: 'Feedback', title: 'Feedback', body: 'Tell us how to make the website better with a 1-minute survey.' },
  { target: 'Profile Settings', title: 'Profile Settings', body: 'Your details, photo, password, and your data (download or delete).' },
  { target: 'Notification', title: 'Notifications', body: "Everything that changes on your bookings and requests. The bell at the top right shows what's new." },
  { title: "You're all set!", body: 'You can see this tour again any time from the ? help button at the bottom right. Enjoy your adventures!' },
];

export const ADMIN_STEPS = [
  { title: 'Welcome to the admin dashboard', body: "A quick tour of each page and what it's for. You can skip it any time." },
  { target: 'Overview', title: 'Overview', body: "Today's numbers, what needs attention in each module, and a Download PDF of the overview." },
  { target: 'Feed', title: 'Feed', body: 'Post announcements, and approve or reject joiners\' posts.' },
  { target: 'Tour Management', title: 'Tour Management', body: 'Create tours from a pre-made template (tick what you need) or from scratch, and edit their dates, pickup points, rates, expenses and itinerary. The Weather button postpones or cancels a date.' },
  { target: 'Booking Management', title: 'Booking Management', body: 'Every booking and payment. Confirming a payment by hand needs your password. Refunds have their own tab.' },
  { target: 'Joiner Accounts', title: 'Joiner Accounts', body: 'See joiners, message them, remove an account (with a reason) or a photo that breaks the rules.' },
  { target: 'Private Tours', title: 'Private Tours', body: 'Approve or reject private group trips, track the 24-hour downpayment and send the package.' },
  { target: 'Requested Tours', title: 'Requested Tours', body: 'New destinations joiners ask for. An approved package is posted on Explore Tours.' },
  { target: 'Tracking Management', title: 'Tracking Management', body: "Van and driver details (with the driver's ID), the driver's live-location link, ETAs and QR check-in." },
  { target: 'Messages', title: 'Messages', body: 'The group chat of each tour date and private tour.' },
  { target: 'Reports', title: 'Reports', body: 'Graphs and analytics, sales by day, month or year, income per tour, reviews and survey results, with PDF.' },
  { target: 'Reviews', title: 'Reviews', body: 'Read reviews and reply as Bandang IBAYO.' },
  { target: 'Notification', title: 'Notifications', body: 'New bookings, payments, requests, cancellations and refunds.' },
  { target: 'System Maintenance', title: 'System Maintenance', body: 'The control center: Booking Rules, Suppliers, Drivers & Vehicles, Pickup Points, Policies, email templates, the chat filter, agency information, the Audit Trail, backups, and System Status (Maintenance Mode).' },
  { target: 'Admin Settings', title: 'Admin Settings', body: 'Main admin only: add or archive admins (with your password) and the inactive-joiner setting.' },
  { title: 'That\'s the tour!', body: 'You can replay it any time: click your name at the top right, then Quick Tour.' },
];
