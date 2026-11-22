import type { EvalCase, FormSchema, GoldField } from "./types";

/**
 * Compact DSL for gold fields:  "id:type:Label[!][:opt1,opt2,...]"
 *   - trailing "!" on the label marks the field required
 *   - 4th segment lists select/radio option labels (values are slugified labels)
 */
export function parseField(spec: string): GoldField {
  const parts = spec.split(":");
  const [id, type, rawLabel] = parts;
  // Option labels may themselves contain ":" (e.g. "3:00 PM"), so re-join the tail.
  const opts = parts.slice(3).join(":");
  const required = rawLabel.endsWith("!");
  const label = required ? rawLabel.slice(0, -1) : rawLabel;
  const field: GoldField = { id, type: type as GoldField["type"], label };
  if (required) field.required = true;
  if (opts) {
    field.options = opts.split(",").map((o) => ({
      value: o.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: o.trim()
    }));
  }
  return field;
}

const c = (domain: string, prompt: string, formTitle: string, fields: string[]): Omit<EvalCase, "id"> => ({
  domain,
  prompt,
  gold: { schemaVersion: 1, formTitle, fields: fields.map(parseField) } as FormSchema
});

// Name + email are common; keep specs short.
const NAME = "fullName:text:Full Name!";
const EMAIL = "email:email:Email Address!";
const PHONE = "phone:text:Phone Number";

const RAW: Array<Omit<EvalCase, "id">> = [
  // ---- healthcare ----
  c("healthcare", "Patient intake form for a dental clinic", "Dental Patient Intake", [NAME, "dob:date:Date of Birth!", PHONE, "insurance:text:Insurance Provider", "allergies:textarea:Known Allergies", "consent:checkbox:I consent to treatment!"]),
  c("healthcare", "Appointment request for a physiotherapy practice", "Physiotherapy Appointment Request", [NAME, EMAIL, "service:select:Service Type!:Sports Injury,Back Pain,Post-Surgery,Other", "preferredDate:date:Preferred Date!", "notes:textarea:Additional Notes"]),
  c("healthcare", "Symptom check-in survey before a telehealth visit", "Telehealth Symptom Check-in", [NAME, "symptoms:textarea:Describe Your Symptoms!", "duration:select:How Long Have You Had Symptoms?!:Less than 1 day,1-3 days,4-7 days,More than a week", "fever:radio:Do You Have a Fever?!:Yes,No", "medications:textarea:Current Medications"]),
  c("healthcare", "Blood donation registration", "Blood Donor Registration", [NAME, EMAIL, "bloodType:select:Blood Type:A+,A-,B+,B-,AB+,AB-,O+,O-", "weight:number:Weight in kg!", "lastDonation:date:Date of Last Donation", "eligible:checkbox:I confirm I am in good health!"]),
  c("healthcare", "Pharmacy prescription refill request", "Prescription Refill Request", [NAME, "dob:date:Date of Birth!", "rxNumber:text:Prescription Number!", "pickup:radio:Pickup Method!:In store,Delivery", PHONE]),
  c("healthcare", "Mental health clinic new client questionnaire", "New Client Questionnaire", [NAME, EMAIL, "reason:textarea:What brings you in?!", "therapyBefore:radio:Have you attended therapy before?:Yes,No", "emergencyContact:text:Emergency Contact Name!"]),
  // ---- hr ----
  c("hr", "Job application form for a software engineer role", "Software Engineer Application", [NAME, EMAIL, PHONE, "experience:number:Years of Experience!", "portfolio:text:Portfolio URL", "coverLetter:textarea:Cover Letter"]),
  c("hr", "Employee time-off request", "Time Off Request", [NAME, "leaveType:select:Leave Type!:Vacation,Sick,Parental,Unpaid", "startDate:date:Start Date!", "endDate:date:End Date!", "reason:textarea:Reason"]),
  c("hr", "Exit interview survey", "Exit Interview", [NAME, "lastDay:date:Last Working Day!", "reasonLeaving:select:Primary Reason for Leaving!:Compensation,Career growth,Management,Relocation,Other", "wouldRecommend:radio:Would you recommend us as an employer?!:Yes,No,Maybe", "feedback:textarea:Additional Feedback"]),
  c("hr", "New hire onboarding details", "New Hire Onboarding", [NAME, EMAIL, "startDate:date:Start Date!", "tshirt:select:T-Shirt Size:S,M,L,XL", "dietary:text:Dietary Restrictions", "laptop:radio:Laptop Preference!:Mac,Windows,Linux"]),
  c("hr", "Internal referral submission", "Employee Referral", ["referrerName:text:Your Name!", "candidateName:text:Candidate Name!", "candidateEmail:email:Candidate Email!", "position:text:Position Referred For!", "relationship:text:How do you know the candidate?"]),
  c("hr", "Quarterly employee satisfaction pulse", "Employee Pulse Survey", ["satisfaction:select:Overall Satisfaction!:Very low,Low,Neutral,High,Very high", "manager:radio:I feel supported by my manager!:Agree,Neutral,Disagree", "workload:select:Workload:Too light,About right,Too heavy", "comments:textarea:Anything else?", "anonymous:checkbox:Submit anonymously"]),
  // ---- education ----
  c("education", "Course enrollment form for an online coding bootcamp", "Bootcamp Enrollment", [NAME, EMAIL, "track:select:Track!:Web Development,Data Science,Cybersecurity", "level:radio:Experience Level!:Beginner,Intermediate,Advanced", "startDate:date:Preferred Start Date", "goals:textarea:What are your goals?"]),
  c("education", "Student feedback survey for a university course", "Course Feedback", ["courseCode:text:Course Code!", "rating:select:Overall Rating!:1,2,3,4,5", "instructorClarity:radio:Was the instructor clear?!:Yes,No,Sometimes", "improvements:textarea:What could be improved?"]),
  c("education", "Scholarship application", "Scholarship Application", [NAME, EMAIL, "gpa:number:GPA!", "major:text:Intended Major!", "essay:textarea:Personal Statement!", "financialNeed:checkbox:I would like to be considered for need-based aid"]),
  c("education", "Parent-teacher conference sign-up", "Parent-Teacher Conference", ["parentName:text:Parent Name!", "studentName:text:Student Name!", "grade:select:Grade!:K,1,2,3,4,5", "slot:select:Preferred Time Slot!:3:00 PM,3:30 PM,4:00 PM,4:30 PM", EMAIL]),
  c("education", "School field trip permission slip", "Field Trip Permission Slip", ["studentName:text:Student Name!", "guardianName:text:Guardian Name!", "emergencyPhone:text:Emergency Phone!", "allergies:textarea:Allergies or Medical Needs", "permission:checkbox:I give permission for my child to attend!"]),
  c("education", "Library membership signup", "Library Membership", [NAME, EMAIL, "address:textarea:Home Address!", "cardType:radio:Membership Type!:Adult,Student,Senior", "dob:date:Date of Birth!"]),
  // ---- ecommerce ----
  c("ecommerce", "Product return request form", "Return Request", ["orderNumber:text:Order Number!", EMAIL, "item:text:Item Name!", "reason:select:Reason for Return!:Damaged,Wrong item,No longer needed,Other", "refundMethod:radio:Refund Method!:Original payment,Store credit", "comments:textarea:Comments"]),
  c("ecommerce", "Customer checkout shipping details", "Shipping Details", [NAME, EMAIL, "address:text:Street Address!", "city:text:City!", "postalCode:text:Postal Code!", "shipping:radio:Shipping Speed!:Standard,Express,Overnight"]),
  c("ecommerce", "Product review submission", "Write a Review", ["productName:text:Product!", "rating:select:Rating!:1,2,3,4,5", "title:text:Review Title!", "body:textarea:Your Review!", "recommend:checkbox:I would recommend this product"]),
  c("ecommerce", "Wholesale account application", "Wholesale Application", ["company:text:Company Name!", "taxId:text:Tax ID!", EMAIL, "monthlyVolume:number:Estimated Monthly Order Volume", "categories:select:Primary Category!:Apparel,Electronics,Home,Beauty"]),
  c("ecommerce", "Gift card purchase", "Buy a Gift Card", ["amount:select:Amount!:$25,$50,$100,$200", "recipientName:text:Recipient Name!", "recipientEmail:email:Recipient Email!", "message:textarea:Personal Message", "deliveryDate:date:Delivery Date"]),
  c("ecommerce", "Pre-order waitlist signup for a new sneaker", "Sneaker Waitlist", [NAME, EMAIL, "size:select:Shoe Size!:7,8,9,10,11,12", "colorway:radio:Colorway!:Black,White,Red", "newsletter:checkbox:Subscribe to drop alerts"]),
  // ---- events ----
  c("events", "Conference registration for a developer summit", "Developer Summit Registration", [NAME, EMAIL, "company:text:Company", "ticket:radio:Ticket Type!:General,VIP,Student", "workshops:select:Workshop Track:Frontend,Backend,AI,DevOps", "dietary:text:Dietary Requirements"]),
  c("events", "Wedding RSVP form", "Wedding RSVP", [NAME, "attending:radio:Will you attend?!:Joyfully accept,Regretfully decline", "guests:number:Number of Guests", "mealChoice:select:Meal Choice:Chicken,Fish,Vegetarian", "songRequest:text:Song Request"]),
  c("events", "Hackathon team registration", "Hackathon Registration", ["teamName:text:Team Name!", "leadEmail:email:Team Lead Email!", "members:number:Number of Members!", "idea:textarea:Project Idea", "tshirt:select:T-Shirt Size:S,M,L,XL"]),
  c("events", "Volunteer signup for a charity run", "Charity Run Volunteer Signup", [NAME, EMAIL, PHONE, "role:select:Preferred Role!:Registration,Water station,Course marshal,Medical", "shift:radio:Shift!:Morning,Afternoon"]),
  c("events", "Speaker proposal submission for a meetup", "Call for Speakers", [NAME, EMAIL, "talkTitle:text:Talk Title!", "abstract:textarea:Abstract!", "duration:select:Duration!:15 min,30 min,45 min", "bio:textarea:Speaker Bio"]),
  c("events", "Birthday party invitation response", "Party RSVP", [NAME, "coming:radio:Are you coming?!:Yes,No", "plusOnes:number:Plus Ones", "allergies:text:Food Allergies"]),
  // ---- saas ----
  c("saas", "Bug report form for a project management app", "Bug Report", ["title:text:Title!", "severity:select:Severity!:Low,Medium,High,Critical", "steps:textarea:Steps to Reproduce!", "expected:textarea:Expected Behavior", "browser:select:Browser:Chrome,Firefox,Safari,Edge", EMAIL]),
  c("saas", "Feature request submission", "Feature Request", [EMAIL, "title:text:Feature Title!", "description:textarea:Describe the feature!", "priority:radio:How important is this to you?:Nice to have,Important,Critical"]),
  c("saas", "Free trial signup", "Start Your Free Trial", [NAME, "workEmail:email:Work Email!", "company:text:Company Name!", "teamSize:select:Team Size!:1-10,11-50,51-200,200+", "terms:checkbox:I agree to the terms of service!"]),
  c("saas", "Enterprise demo request", "Request a Demo", [NAME, "workEmail:email:Work Email!", "company:text:Company!", "jobTitle:text:Job Title", "useCase:textarea:What do you want to achieve?", "preferredDate:date:Preferred Demo Date"]),
  c("saas", "Subscription cancellation survey", "Cancel Subscription", [EMAIL, "reason:select:Why are you cancelling?!:Too expensive,Missing features,Found alternative,No longer needed", "alternative:text:Which alternative?", "feedback:textarea:How could we improve?", "comeback:radio:Would you consider returning?:Yes,No,Maybe"]),
  c("saas", "API access key request for developers", "API Access Request", [NAME, EMAIL, "projectName:text:Project Name!", "useCase:textarea:Intended Use!", "expectedRps:number:Expected Requests per Second", "acceptTerms:checkbox:I accept the API terms!"]),
  // ---- finance ----
  c("finance", "Personal loan application", "Personal Loan Application", [NAME, EMAIL, "amount:number:Loan Amount!", "term:select:Term!:12 months,24 months,36 months,60 months", "income:number:Annual Income!", "employment:radio:Employment Status!:Employed,Self-employed,Unemployed,Retired"]),
  c("finance", "Expense reimbursement claim", "Expense Claim", [NAME, "expenseDate:date:Expense Date!", "category:select:Category!:Travel,Meals,Equipment,Software,Other", "amount:number:Amount!", "description:textarea:Description!"]),
  c("finance", "Invoice dispute form", "Invoice Dispute", ["invoiceNumber:text:Invoice Number!", EMAIL, "disputedAmount:number:Disputed Amount!", "reason:textarea:Reason for Dispute!", "contactPref:radio:Preferred Contact Method:Email,Phone"]),
  c("finance", "Investor interest registration for a startup round", "Investor Interest", [NAME, EMAIL, "firm:text:Firm", "checkSize:select:Typical Check Size!:Under $25k,$25k-$100k,$100k-$500k,Over $500k", "accredited:checkbox:I am an accredited investor!"]),
  c("finance", "Budget planning input from department heads", "Department Budget Request", ["department:text:Department!", "headName:text:Department Head!", "requestedBudget:number:Requested Budget!", "justification:textarea:Justification!", "fiscalYear:select:Fiscal Year!:2026,2027"]),
  c("finance", "Tax document upload checklist for clients", "Tax Documents Checklist", [NAME, EMAIL, "hasW2:checkbox:I have my W-2", "has1099:checkbox:I have my 1099 forms", "dependents:number:Number of Dependents", "notes:textarea:Notes for your accountant"]),
  // ---- realestate ----
  c("realestate", "Rental property application", "Rental Application", [NAME, EMAIL, PHONE, "moveInDate:date:Desired Move-in Date!", "income:number:Monthly Income!", "pets:radio:Do you have pets?:Yes,No"]),
  c("realestate", "Property viewing request", "Book a Viewing", [NAME, EMAIL, "propertyId:text:Property ID!", "viewingDate:date:Preferred Date!", "timeOfDay:radio:Time of Day:Morning,Afternoon,Evening"]),
  c("realestate", "Maintenance request from a tenant", "Maintenance Request", ["unit:text:Unit Number!", NAME, "issueType:select:Issue Type!:Plumbing,Electrical,Heating,Appliance,Other", "description:textarea:Describe the Issue!", "urgent:checkbox:This is an emergency", "entryPermission:checkbox:Permission to enter if not home"]),
  c("realestate", "Home seller listing inquiry", "List Your Home", [NAME, EMAIL, "address:text:Property Address!", "bedrooms:number:Bedrooms", "askingPrice:number:Expected Asking Price", "timeline:select:Selling Timeline:Immediately,1-3 months,3-6 months"]),
  c("realestate", "Roommate matching profile", "Find a Roommate", [NAME, EMAIL, "budget:number:Monthly Budget!", "smoker:radio:Do you smoke?!:Yes,No", "schedule:select:Daily Schedule:Early bird,Night owl,Flexible", "about:textarea:About You"]),
  c("realestate", "HOA violation report", "HOA Violation Report", ["address:text:Address of Violation!", "violationType:select:Type!:Noise,Parking,Landscaping,Trash,Other", "date:date:Date Observed!", "details:textarea:Details!", EMAIL]),
  // ---- travel ----
  c("travel", "Hotel booking inquiry", "Hotel Booking", [NAME, EMAIL, "checkIn:date:Check-in Date!", "checkOut:date:Check-out Date!", "guests:number:Number of Guests!", "roomType:select:Room Type:Standard,Deluxe,Suite"]),
  c("travel", "Group tour booking request", "Group Tour Booking", ["organizer:text:Organizer Name!", EMAIL, "destination:select:Destination!:Japan,Italy,Peru,Iceland", "groupSize:number:Group Size!", "travelDate:date:Preferred Departure Date!", "requests:textarea:Special Requests"]),
  c("travel", "Airport transfer request", "Airport Transfer", [NAME, PHONE, "flightNumber:text:Flight Number!", "arrival:date:Arrival Date!", "passengers:number:Passengers!", "luggage:select:Luggage:Carry-on only,1-2 bags,3+ bags"]),
  c("travel", "Travel insurance quote", "Travel Insurance Quote", [NAME, EMAIL, "destination:text:Destination!", "tripCost:number:Trip Cost!", "travelers:number:Number of Travelers!", "coverage:radio:Coverage Level!:Basic,Standard,Premium"]),
  c("travel", "Visa pre-screening questionnaire", "Visa Pre-screening", [NAME, "nationality:text:Nationality!", "passportNumber:text:Passport Number!", "purpose:select:Purpose of Visit!:Tourism,Business,Study,Transit", "arrivalDate:date:Intended Arrival!"]),
  c("travel", "Car rental reservation", "Car Rental Reservation", [NAME, "licenseNumber:text:Driver License Number!", "pickupDate:date:Pickup Date!", "returnDate:date:Return Date!", "carClass:select:Car Class!:Economy,Compact,SUV,Luxury", "insurance:checkbox:Add full insurance"]),
  // ---- nonprofit ----
  c("nonprofit", "Donation form for an animal shelter", "Donate to the Shelter", [NAME, EMAIL, "amount:select:Donation Amount!:$10,$25,$50,$100,Other", "recurring:checkbox:Make this a monthly donation", "dedication:text:In honor of"]),
  c("nonprofit", "Food bank assistance request", "Food Assistance Request", [NAME, PHONE, "householdSize:number:Household Size!", "address:text:Address!", "dietary:textarea:Dietary Needs"]),
  c("nonprofit", "Grant application for a community project", "Community Grant Application", ["orgName:text:Organization Name!", EMAIL, "amountRequested:number:Amount Requested!", "projectSummary:textarea:Project Summary!", "startDate:date:Project Start Date"]),
  c("nonprofit", "Mentor program application", "Mentor Application", [NAME, EMAIL, "expertise:select:Area of Expertise!:Engineering,Design,Business,Healthcare", "hoursPerMonth:number:Hours per Month!", "motivation:textarea:Why do you want to mentor?"]),
  c("nonprofit", "Adopt a pet application", "Pet Adoption Application", [NAME, EMAIL, "petName:text:Pet You Are Interested In!", "homeType:radio:Home Type!:House,Apartment", "otherPets:radio:Other pets at home?:Yes,No", "experience:textarea:Previous Pet Experience"]),
  c("nonprofit", "Neighborhood cleanup volunteer registration", "Cleanup Day Registration", [NAME, EMAIL, "group:text:Group or Organization", "attendees:number:Number of Attendees!", "tools:checkbox:I can bring my own tools"]),
  // ---- legal ----
  c("legal", "New client intake for a law firm", "Client Intake", [NAME, EMAIL, PHONE, "matterType:select:Matter Type!:Family,Immigration,Employment,Real Estate,Criminal", "summary:textarea:Brief Summary of Your Matter!", "conflict:text:Names of Opposing Parties"]),
  c("legal", "Non-disclosure agreement request", "NDA Request", ["requester:text:Your Name!", EMAIL, "counterparty:text:Counterparty Company!", "ndaType:radio:NDA Type!:Mutual,One-way", "term:select:Term:1 year,2 years,5 years"]),
  c("legal", "Data subject access request under GDPR", "Data Access Request", [NAME, EMAIL, "requestType:select:Request Type!:Access,Deletion,Correction,Portability", "details:textarea:Details of Request", "identityConfirm:checkbox:I confirm I am the data subject!"]),
  c("legal", "Contract review submission", "Contract Review Request", [NAME, EMAIL, "contractType:text:Contract Type!", "deadline:date:Needed By!", "urgency:radio:Urgency:Standard,Rush"]),
  c("legal", "Trademark inquiry", "Trademark Inquiry", [NAME, EMAIL, "markText:text:Proposed Mark!", "goods:textarea:Goods or Services!", "country:text:Country of Filing!"]),
  c("legal", "Witness statement form", "Witness Statement", [NAME, "incidentDate:date:Date of Incident!", "location:text:Location!", "statement:textarea:Your Statement!", "truthful:checkbox:I declare this statement is true!"]),
  // ---- government ----
  c("government", "Business permit application", "Business Permit Application", ["businessName:text:Business Name!", "ownerName:text:Owner Name!", "businessType:select:Business Type!:Retail,Restaurant,Services,Manufacturing", "address:text:Business Address!", "employees:number:Number of Employees"]),
  c("government", "Pothole report for city maintenance", "Report a Pothole", ["location:text:Street and Cross Street!", "severity:radio:Severity!:Minor,Moderate,Severe", "description:textarea:Description", EMAIL]),
  c("government", "Voter registration form", "Voter Registration", [NAME, "dob:date:Date of Birth!", "address:text:Residential Address!", "citizen:checkbox:I am a citizen!", "party:select:Party Affiliation:None,Democratic,Republican,Other"]),
  c("government", "Public records request", "Records Request", [NAME, EMAIL, "agency:text:Agency!", "recordsDescription:textarea:Records Requested!", "feeWaiver:checkbox:Request a fee waiver"]),
  c("government", "Parking permit application for residents", "Parking Permit Application", [NAME, "address:text:Home Address!", "plate:text:License Plate!", "vehicleMake:text:Vehicle Make", "proofOfResidence:radio:Proof of Residence Type!:Utility bill,Lease,Tax statement"]),
  c("government", "Community meeting public comment signup", "Public Comment Signup", [NAME, "topic:text:Agenda Item!", "position:radio:Your Position:For,Against,Neutral", "minutes:number:Minutes Requested"]),
  // ---- restaurants ----
  c("restaurants", "Table reservation form for a restaurant", "Reserve a Table", [NAME, PHONE, "date:date:Date!", "partySize:number:Party Size!", "seating:radio:Seating Preference:Indoor,Outdoor,Bar", "occasion:select:Occasion:Birthday,Anniversary,Business,None"]),
  c("restaurants", "Catering order request", "Catering Request", [NAME, EMAIL, "eventDate:date:Event Date!", "guests:number:Number of Guests!", "menu:select:Menu!:Buffet,Plated,Cocktail,Custom", "dietary:textarea:Dietary Restrictions"]),
  c("restaurants", "Customer dining feedback", "Dining Feedback", ["visitDate:date:Date of Visit!", "food:select:Food Quality!:Poor,Fair,Good,Excellent", "service:select:Service!:Poor,Fair,Good,Excellent", "comments:textarea:Comments", EMAIL]),
  c("restaurants", "Food truck event booking", "Book the Food Truck", [NAME, EMAIL, "eventType:text:Event Type!", "eventDate:date:Event Date!", "location:text:Location!", "attendees:number:Expected Attendees"]),
  c("restaurants", "Cafe job application for baristas", "Barista Application", [NAME, EMAIL, PHONE, "availability:select:Availability!:Weekdays,Weekends,Both", "experience:textarea:Previous Experience"]),
  c("restaurants", "Online takeout order form", "Takeout Order", [NAME, PHONE, "items:textarea:Order Items!", "pickupTime:text:Pickup Time!", "payment:radio:Payment Method!:Pay at pickup,Card"]),
  // ---- fitness ----
  c("fitness", "Gym membership signup", "Join the Gym", [NAME, EMAIL, "plan:radio:Membership Plan!:Monthly,Annual,Day pass", "startDate:date:Start Date!", "goals:select:Primary Goal:Lose weight,Build muscle,Endurance,General health", "waiver:checkbox:I accept the liability waiver!"]),
  c("fitness", "Personal training consultation request", "Training Consultation", [NAME, EMAIL, "age:number:Age!", "fitnessLevel:select:Fitness Level!:Beginner,Intermediate,Advanced", "injuries:textarea:Injuries or Limitations", "sessionsPerWeek:number:Sessions per Week"]),
  c("fitness", "Yoga class booking", "Book a Yoga Class", [NAME, EMAIL, "classType:select:Class Type!:Vinyasa,Hatha,Yin,Restorative", "date:date:Class Date!", "firstTime:checkbox:This is my first class"]),
  c("fitness", "Marathon race registration", "Marathon Registration", [NAME, EMAIL, "dob:date:Date of Birth!", "distance:radio:Distance!:5K,10K,Half Marathon,Full Marathon", "finishTime:text:Estimated Finish Time", "emergencyContact:text:Emergency Contact!"]),
  c("fitness", "Nutrition coaching intake", "Nutrition Intake", [NAME, EMAIL, "weight:number:Current Weight in kg!", "diet:select:Current Diet:Omnivore,Vegetarian,Vegan,Keto", "allergies:textarea:Food Allergies", "goal:textarea:Your Goal!"]),
  c("fitness", "Youth sports league registration", "Youth League Registration", ["playerName:text:Player Name!", "dob:date:Date of Birth!", "sport:select:Sport!:Soccer,Basketball,Baseball", "guardianEmail:email:Guardian Email!", "medical:textarea:Medical Conditions"]),
  // ---- support ----
  c("support", "Customer support ticket form", "Contact Support", [NAME, EMAIL, "category:select:Category!:Billing,Technical,Account,Other", "subject:text:Subject!", "message:textarea:How can we help?!", "orderId:text:Order ID"]),
  c("support", "Warranty claim registration", "Warranty Claim", [NAME, EMAIL, "serialNumber:text:Serial Number!", "purchaseDate:date:Purchase Date!", "problem:textarea:Describe the Problem!"]),
  c("support", "Net promoter score survey", "How Did We Do?", ["score:select:How likely are you to recommend us?!:0,1,2,3,4,5,6,7,8,9,10", "reason:textarea:What is the main reason for your score?", EMAIL, "followUp:checkbox:You may contact me about my feedback"]),
  c("support", "Complaint escalation form", "Escalate a Complaint", [NAME, EMAIL, "ticketId:text:Original Ticket ID!", "details:textarea:Why are you escalating?!", "desiredOutcome:select:Desired Outcome!:Refund,Replacement,Apology,Other"]),
  c("support", "Accessibility feedback for a website", "Accessibility Feedback", [EMAIL, "pageUrl:text:Page URL!", "assistiveTech:text:Assistive Technology Used", "issue:textarea:Describe the Barrier!"]),
  c("support", "Delivery issue report", "Report a Delivery Problem", ["orderNumber:text:Order Number!", "issue:radio:What happened?!:Late,Damaged,Missing items,Wrong address", "details:textarea:Details", PHONE]),
  // ---- research ----
  c("research", "Consent and demographics for a psychology study", "Study Participation", ["participantId:text:Participant ID!", "age:number:Age!", "gender:select:Gender:Female,Male,Non-binary,Prefer not to say", "education:select:Highest Education:High school,Bachelor,Master,Doctorate", "consent:checkbox:I give informed consent!"]),
  c("research", "Usability test screener survey", "Usability Study Screener", [NAME, EMAIL, "usage:radio:How often do you use our product?!:Daily,Weekly,Monthly,Never", "device:select:Primary Device!:Desktop,Laptop,Tablet,Phone", "availability:textarea:Your Availability"]),
  c("research", "Lab equipment booking", "Equipment Booking", [NAME, "equipment:select:Equipment!:Microscope,Centrifuge,Spectrometer", "date:date:Date!", "hours:number:Hours Needed!", "projectCode:text:Project Code!"]),
  c("research", "Conference paper submission", "Paper Submission", ["title:text:Paper Title!", "authors:text:Authors!", EMAIL, "abstract:textarea:Abstract!", "track:select:Track!:Machine Learning,Systems,Security,HCI", "originalWork:checkbox:This work is original!"]),
  c("research", "Peer review assignment response", "Reviewer Response", [NAME, "paperId:text:Paper ID!", "decision:radio:Will you review?!:Accept,Decline", "conflict:checkbox:I have a conflict of interest", "comments:textarea:Comments"]),
  c("research", "Field survey on local biodiversity", "Biodiversity Field Survey", ["observer:text:Observer!", "date:date:Date!", "location:text:Location!", "species:text:Species Observed!", "count:number:Count!", "notes:textarea:Habitat Notes"]),
  // ---- it ----
  c("it", "IT helpdesk request for new hardware", "Hardware Request", [NAME, "department:text:Department!", "device:select:Device!:Laptop,Monitor,Keyboard,Headset", "justification:textarea:Business Justification!", "manager:text:Manager Name!"]),
  c("it", "Access request for a production system", "Production Access Request", [NAME, EMAIL, "system:text:System!", "accessLevel:radio:Access Level!:Read-only,Read-write,Admin", "duration:select:Duration!:1 day,1 week,1 month,Permanent", "reason:textarea:Reason!"]),
  c("it", "Security incident report", "Security Incident Report", ["reporter:text:Reporter!", "incidentType:select:Incident Type!:Phishing,Malware,Data leak,Lost device,Other", "detectedAt:date:Date Detected!", "description:textarea:What happened?!", "dataInvolved:checkbox:Sensitive data may be involved"]),
  c("it", "Change request for deployment", "Change Request", ["title:text:Change Title!", "environment:radio:Environment!:Staging,Production", "riskLevel:select:Risk Level!:Low,Medium,High", "rollbackPlan:textarea:Rollback Plan!", "scheduledFor:date:Scheduled Date!"]),
  c("it", "Software license request", "License Request", [NAME, EMAIL, "software:text:Software Name!", "seats:number:Number of Seats!", "costCenter:text:Cost Center"]),
  c("it", "Open source project contributor onboarding", "Contributor Onboarding", ["githubHandle:text:GitHub Handle!", EMAIL, "areas:select:Area of Interest:Docs,Frontend,Backend,Testing", "cla:checkbox:I agree to the contributor license agreement!"]),
  // ---- marketing ----
  c("marketing", "Newsletter signup", "Subscribe to Our Newsletter", [EMAIL, "firstName:text:First Name", "frequency:radio:Frequency!:Daily,Weekly,Monthly", "topics:select:Favorite Topic:Tech,Design,Business"]),
  c("marketing", "Webinar registration", "Webinar Registration", [NAME, "workEmail:email:Work Email!", "company:text:Company", "role:text:Job Role", "questions:textarea:Questions for the Speakers"]),
  c("marketing", "Influencer collaboration application", "Creator Collaboration", [NAME, EMAIL, "platform:select:Main Platform!:Instagram,YouTube,TikTok,Twitch", "followers:number:Follower Count!", "handle:text:Profile Link!", "pitch:textarea:Collaboration Idea"]),
  c("marketing", "Contest entry form", "Giveaway Entry", [NAME, EMAIL, "favorite:text:Favorite Product", "age18:checkbox:I am 18 or older!", "rules:checkbox:I accept the contest rules!"]),
  c("marketing", "Brand survey on awareness", "Brand Awareness Survey", ["heardOf:radio:Have you heard of our brand?!:Yes,No", "source:select:Where did you hear about us?:Search,Social,Friend,Ad", "opinion:select:Overall Opinion:Negative,Neutral,Positive", "age:number:Age"]),
  c("marketing", "Partner program application", "Partner Program Application", ["company:text:Company Name!", "website:text:Website!", EMAIL, "partnerType:select:Partner Type!:Reseller,Referral,Integration", "clients:number:Number of Clients"]),
];

export const SEED_CASES: EvalCase[] = RAW.map((r, i) => ({ id: `seed-${String(i + 1).padStart(3, "0")}`, ...r }));
