import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BODY_AREAS = ["lower back", "neck", "shoulder", "knee", "hip", "other"] as const;

interface PatientSeed {
  firstName: string;
  lastName: string;
  phone: string;
  type: "new" | "existing";
  recurringArea?: string;
  recurringSeverity?: number;
}

const PATIENTS: PatientSeed[] = [
  { firstName: "Sarah", lastName: "Jenkins", phone: "5195550101", type: "existing", recurringArea: "lower back", recurringSeverity: 4 },
  { firstName: "Michael", lastName: "Chen", phone: "5195550102", type: "new", recurringArea: "knee", recurringSeverity: 5 },
  { firstName: "Emily", lastName: "Rodriguez", phone: "5195550103", type: "existing", recurringArea: "neck", recurringSeverity: 3 },
  { firstName: "David", lastName: "O'Connor", phone: "5195550104", type: "new", recurringArea: "shoulder", recurringSeverity: 4 },
  { firstName: "Priya", lastName: "Patel", phone: "5195550105", type: "existing", recurringArea: "hip", recurringSeverity: 2 },
  { firstName: "James", lastName: "Wilson", phone: "5195550106", type: "new" },
  { firstName: "Amanda", lastName: "Taylor", phone: "5195550107", type: "existing", recurringArea: "lower back", recurringSeverity: 5 },
  { firstName: "Robert", lastName: "Miller", phone: "5195550108", type: "new" },
  { firstName: "Jessica", lastName: "Brown", phone: "5195550109", type: "existing" },
  { firstName: "Daniel", lastName: "White", phone: "5195550110", type: "new" },
  { firstName: "Ashley", lastName: "Harris", phone: "5195550111", type: "new" },
  { firstName: "Christopher", lastName: "Martin", phone: "5195550112", type: "existing" },
  { firstName: "Megan", lastName: "Thompson", phone: "5195550113", type: "new" },
  { firstName: "Brian", lastName: "Garcia", phone: "5195550114", type: "existing" },
  { firstName: "Lauren", lastName: "Martinez", phone: "5195550115", type: "new" },
];

async function main() {
  console.log("Seeding Happy Harmony Clinic Database...");

  // Clean existing data
  await prisma.toolEvent.deleteMany();
  await prisma.transcriptTurn.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.call.deleteMany();
  await prisma.patient.deleteMany();

  // Create patients
  const createdPatients: Record<string, any> = {};
  for (const p of PATIENTS) {
    const patient = await prisma.patient.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        patientType: p.type,
        firstSeenAt: new Date(Date.now() - Math.floor(Math.random() * 60 + 10) * 86400000),
      },
    });
    createdPatients[p.phone] = { ...patient, seedConfig: p };
  }

  const outcomes = ["booked", "booked", "booked", "booked", "no_booking", "existing_lookup", "out_of_scope"];
  const sentiments = ["positive", "positive", "positive", "neutral", "neutral", "negative"];
  const complaints = [
    { area: "lower back", desc: "Chronic lumbar stiffness and sharp pain when bending forward." },
    { area: "neck", desc: "Cervical spine stiffness radiating into upper traps after desk work." },
    { area: "shoulder", desc: "Rotator cuff impingement, unable to raise arm above head." },
    { area: "knee", desc: "Patellar tendon pain following running, swelling around joint." },
    { area: "hip", desc: "Deep groin and hip flexor ache with prolonged sitting." },
    { area: "other", desc: "Post-sprain ankle instability and tendonitis." },
  ];

  const now = new Date();

  // Generate 40 calls
  for (let i = 1; i <= 40; i++) {
    // Distribute calls over the last 30 days
    const daysAgo = Math.floor(Math.random() * 29);
    // Bias hours towards clinic open hours (10 AM - 6 PM)
    const hour = Math.floor(Math.random() * 9) + 9; // 9 AM to 6 PM
    const minute = Math.floor(Math.random() * 59);

    const callStartTime = new Date(now.getTime() - daysAgo * 86400000);
    callStartTime.setHours(hour, minute, 0, 0);

    const duration = Math.floor(Math.random() * 150) + 45; // 45s to 195s
    const callEndTime = new Date(callStartTime.getTime() + duration * 1000);

    const outcome = outcomes[i % outcomes.length];
    const sentiment = sentiments[i % sentiments.length];
    const status = outcome === "out_of_scope" && i % 3 === 0 ? "transferred" :
                   outcome === "no_booking" && i % 4 === 0 ? "abandoned" : "completed";

    // Select patient
    const patientKeys = Object.keys(createdPatients);
    // For recurring issue simulation: assign repeat calls to specific patients
    let patientObj: any = null;
    let selectedArea = complaints[i % complaints.length].area;
    let complaintDesc = complaints[i % complaints.length].desc;
    let severity = Math.floor(Math.random() * 4) + 1;

    if (i <= 6) {
      // Sarah Jenkins: recurring lower back
      patientObj = createdPatients["5195550101"];
      selectedArea = "lower back";
      severity = i % 2 === 0 ? 5 : 4;
    } else if (i <= 10) {
      // Michael Chen: recurring knee
      patientObj = createdPatients["5195550102"];
      selectedArea = "knee";
      severity = 4;
    } else if (i <= 13) {
      // Amanda Taylor: recurring lower back (high severity)
      patientObj = createdPatients["5195550107"];
      selectedArea = "lower back";
      severity = 5;
    } else if (i <= 16) {
      // Emily Rodriguez: recurring neck
      patientObj = createdPatients["5195550103"];
      selectedArea = "neck";
      severity = 3;
    } else if (i <= 32) {
      patientObj = createdPatients[patientKeys[i % patientKeys.length]];
    }

    const callerPhone = patientObj ? patientObj.phone : `519555${(1000 + i).toString().slice(1)}`;

    const summaries: Record<string, string> = {
      booked: `Caller booked an initial assessment for ${selectedArea} rehabilitation. Direct billing insurance confirmed.`,
      no_booking: `Caller inquired about evening slot availability for ${selectedArea} therapy but declined offered morning slots.`,
      existing_lookup: `Returning patient called to verify clinic hours and active treatment record.`,
      out_of_scope: `Caller requested neurological prescription advice. Receptionist politely redirected to attending physiotherapist.`,
    };

    const call = await prisma.call.create({
      data: {
        startedAt: callStartTime,
        endedAt: callEndTime,
        durationSeconds: duration,
        callerPhone,
        status,
        outcome,
        patientId: patientObj?.id ?? null,
        summary: summaries[outcome] || "General clinic receptionist inquiry.",
        sentiment,
        recordingUrl: i % 2 === 0 ? `https://storage.googleapis.com/happy-harmony-recordings/call-${i}.mp3` : null,
      },
    });

    // Transcript turns
    const pName = patientObj ? patientObj.firstName : "Alex";
    const transcriptTurns = [
      { role: "agent", text: "Hello, thank you for calling Happy Harmony Physiotherapy and Spine Rehabilitation Clinic! My name is Hannah. How may I help you today?", secOffset: 0 },
      { role: "caller", text: patientObj ? `Hi Hannah, I'm ${patientObj.type === "new" ? "a new patient looking to book" : "a returning patient calling about my appointment"}.` : "Hi, I need help with some body pain.", secOffset: 5 },
      { role: "agent", text: "I'd be glad to help you. What pain, injury, or stiffness brings you in today?", secOffset: 12 },
      { role: "caller", text: `I have severe ${selectedArea} issues, especially ${complaintDesc.toLowerCase()}`, secOffset: 20 },
      { role: "agent", text: "I am sorry to hear you are dealing with that. What day and time work best for your assessment?", secOffset: 28 },
    ];

    if (outcome === "booked") {
      transcriptTurns.push(
        { role: "caller", text: "Do you have any openings this coming Wednesday afternoon around 3 PM?", secOffset: 38 },
        { role: "agent", text: "Yes, Wednesday at 3:00 PM is open. Will you be using direct billing insurance?", secOffset: 48 },
        { role: "caller", text: "Yes, I have Sun Life insurance.", secOffset: 55 },
        { role: "agent", text: `Your appointment is confirmed for Wednesday at 3:00 PM. Thank you for choosing Happy Harmony Physiotherapy and Spine Rehabilitation. Take care!`, secOffset: 65 }
      );
    } else {
      transcriptTurns.push(
        { role: "caller", text: "I was looking for Sunday evening appointments.", secOffset: 36 },
        { role: "agent", text: "We are closed Sundays, but we have openings Monday through Friday from 10 AM to 6 PM.", secOffset: 44 }
      );
    }

    for (const turn of transcriptTurns) {
      await prisma.transcriptTurn.create({
        data: {
          callId: call.id,
          role: turn.role,
          text: turn.text,
          timestamp: new Date(callStartTime.getTime() + turn.secOffset * 1000),
        },
      });
    }

    // Complaint
    if (patientObj) {
      await prisma.complaint.create({
        data: {
          callId: call.id,
          patientId: patientObj.id,
          bodyArea: selectedArea,
          description: complaintDesc,
          severity,
          createdAt: callStartTime,
        },
      });
    }

    // Appointment
    if (outcome === "booked" && patientObj) {
      const apptDate = new Date(callStartTime.getTime() + (Math.floor(Math.random() * 5) + 1) * 86400000);
      apptDate.setHours(15, 0, 0, 0);

      const apptStatus = apptDate < now ? (i % 5 === 0 ? "cancelled" : "completed") : "booked";

      await prisma.appointment.create({
        data: {
          callId: call.id,
          patientId: patientObj.id,
          startsAt: apptDate,
          type: patientObj.patientType === "new" ? "initial" : "followup",
          insuranceDirectBilling: i % 3 !== 0,
          status: apptStatus,
        },
      });
    }

    // Tool Events
    if (patientObj?.patientType === "existing") {
      await prisma.toolEvent.create({
        data: {
          callId: call.id,
          toolName: "Vapi-Patient-Lookup",
          arguments: JSON.stringify({ phone: callerPhone }),
          result: JSON.stringify({ found: true, patient: { name: `${pName} ${patientObj.lastName}` } }),
          durationMs: Math.floor(Math.random() * 180) + 80,
          success: true,
          timestamp: new Date(callStartTime.getTime() + 10000),
        },
      });
    }

    if (outcome === "booked") {
      await prisma.toolEvent.create({
        data: {
          callId: call.id,
          toolName: "vapi-check-availability",
          arguments: JSON.stringify({ appointment_date: "2026-10-24", appointment_time: "3:00 PM" }),
          result: JSON.stringify({ status: "available", appointment_date: "2026-10-24", appointment_time: "3:00 PM" }),
          durationMs: Math.floor(Math.random() * 220) + 110,
          success: true,
          timestamp: new Date(callStartTime.getTime() + 42000),
        },
      });

      await prisma.toolEvent.create({
        data: {
          callId: call.id,
          toolName: "Vapi-save-appointment",
          arguments: JSON.stringify({
            patient_name: `${pName} ${patientObj?.lastName ?? "Smith"}`,
            phone: callerPhone,
            area_of_concern: selectedArea,
            appointment_date: "2026-10-24",
            appointment_time: "3:00 PM",
            insurance_company: "Sun Life",
          }),
          result: JSON.stringify({ status: "success", booking_id: `HH-APPT-${1000 + i}` }),
          durationMs: Math.floor(Math.random() * 250) + 120,
          success: true,
          timestamp: new Date(callStartTime.getTime() + 58000),
        },
      });

      await prisma.toolEvent.create({
        data: {
          callId: call.id,
          toolName: "end_after_reception",
          arguments: "{}",
          result: JSON.stringify({ status: "call_ended" }),
          durationMs: 40,
          success: true,
          timestamp: new Date(callStartTime.getTime() + 66000),
        },
      });
    }
  }

  console.log("Successfully seeded 40 realistic clinic calls with patients, complaints, appointments & transcripts!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
