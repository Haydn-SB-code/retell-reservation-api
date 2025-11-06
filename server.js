const express = require('express');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(express.json());

// Simple in-memory business storage (for demo)
const businesses = new Map();

// Set up business on startup
async function setupBusiness() {
  try {
    const serviceKey = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
    businesses.set('dollar-shop', {
      name: 'Dollar Shop Hot Pot',
      calendar_id: process.env.GOOGLE_CALENDAR_ID,
      service_account_key: serviceKey,
      timezone: 'America/New_York',
      duration: 90,
      hours_start: 11,
      hours_end: 22
    });
    console.log('✓ Business configured');
  } catch (e) {
    console.log('Note: Service account not configured yet');
  }
}

setupBusiness();

// Create Google Calendar client
async function getCalendar(serviceAccountKey) {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

// Check availability
async function checkAvailability(calendar, calendarId, date, time, duration) {
  const [h, m] = time.split(':');
  const start = new Date(`${date}T${time}`);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + duration);

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    });
    return res.data.items.length === 0;
  } catch (e) {
    console.error('Calendar error:', e.message);
    return true;
  }
}

// Main webhook
app.post('/webhook/reservation', async (req, res) => {
  try {
    const { business_id, name, date, time, party_size, phone_number } = req.body;

    if (!business_id || !name || !date || !time || !party_size || !phone_number) {
      return res.json({
        success: false,
        message: 'Missing information. Please provide all details.'
      });
    }

    const business = businesses.get(business_id);
    if (!business) {
      return res.json({
        success: false,
        message: 'Business not found.'
      });
    }

    // Get calendar client
    const calendar = await getCalendar(business.service_account_key);

    // Check availability
    const available = await checkAvailability(
      calendar,
      business.calendar_id,
      date,
      time,
      business.duration
    );

    if (!available) {
      return res.json({
        success: false,
        message: 'That time slot is not available. Please try another time.',
        suggested_action: 'ask_alternative_time'
      });
    }

    // Create calendar event
    const endTime = new Date(`${date}T${time}`);
    endTime.setMinutes(endTime.getMinutes() + business.duration);

    try {
      await calendar.events.insert({
        calendarId: business.calendar_id,
        resource: {
          summary: `Reservation: ${name} (${party_size} people)`,
          description: `Phone: ${phone_number}\nParty Size: ${party_size}`,
          start: {
            dateTime: new Date(`${date}T${time}`).toISOString(),
            timeZone: business.timezone,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: business.timezone,
          },
        },
      });
    } catch (e) {
      console.error('Event creation error:', e.message);
    }

    res.json({
      success: true,
      message: `Perfect! Your reservation is confirmed for ${name} at ${time} on ${date}. We look forward to serving your party of ${party_size}!`
    });

  } catch (error) {
    console.error('Error:', error);
    res.json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', businesses: Array.from(businesses.keys()) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
