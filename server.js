const express = require('express');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(express.json());

const businesses = new Map();

async function setupBusiness() {
  try {
    const serviceKey = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
    businesses.set('dollar-shop', {
      name: 'Dollar Shop Hot Pot',
      calendar_id: process.env.GOOGLE_CALENDAR_ID,
      service_account_key: serviceKey,
      timezone: 'America/Vancouver',
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

async function getCalendar(serviceAccountKey) {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

async function checkAvailability(calendar, calendarId, date, time, duration) {
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

app.post('/webhook/send_reservation_info', async (req, res) => {
  try {
    const { customer_name, date, time, party_size, phone_number, special_requests, business_id } = req.body;

    console.log('📞 Reservation request:', { customer_name, date, time, party_size });

    if (!customer_name || !date || !time || !party_size || !phone_number) {
      return res.json({
        success: false,
        message: 'Missing required information.'
      });
    }

    const business = businesses.get(business_id || 'dollar-shop');
    if (!business) {
      return res.json({
        success: false,
        message: 'Business not found.'
      });
    }

    const calendar = await getCalendar(business.service_account_key);
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
        message: 'unavailable'
      });
    }

    const endTime = new Date(`${date}T${time}`);
    endTime.setMinutes(endTime.getMinutes() + business.duration);

    try {
      await calendar.events.insert({
        calendarId: business.calendar_id,
        resource: {
          summary: `Reservation: ${customer_name} (${party_size} people)`,
          description: `Phone: ${phone_number}\nParty Size: ${party_size}${special_requests ? '\nSpecial Requests: ' + special_requests : ''}`,
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
      console.log('✅ Event created for', customer_name);
    } catch (e) {
      console.error('Event creation error:', e.message);
    }

    res.json({
      success: true,
      message: `Perfect! Reservation confirmed for ${customer_name} at ${time} on ${date}.`
    });

  } catch (error) {
    console.error('Reservation error:', error);
    res.json({
      success: false,
      message: 'Something went wrong.'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});