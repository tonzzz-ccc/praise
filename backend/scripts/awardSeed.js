// Descriptions and behavioral indicators are copied word for word from the official nomination forms.
// Dangal ng MTRC is two awards, Level I and Level II, so each level has its own winner.
const awardCategories = [
  {
    code: 'DANGAL',
    sort_order: 1,
    name: 'Dangal ng MTRC Award Level I',
    description:
      'This award is conferred to regular employee belonging to the second and first level for performance of an extraordinary act or public service and consistent demonstration of exemplary ethical behaviour based on the observance of the eight norms of behaviour provided under RA No. 6713',
    applies_to: 'permanent',
    nominee_type: 'individual',
    has_grant: 1,
    behavioral_indicators: [
      'Leadership',
      'Critical Thinking',
      'Integrity',
      'God-centeredness',
      'Nurturing',
      'Innovative',
      'Teamwork',
      'Excellence',
    ],
    tiers: [{ tier_label: 'Level I', max_amount: 5000, salary_grade_min: 1, salary_grade_max: 11 }],
  },
  {
    code: 'DANGAL_NG_MTRC_AWARD_LEVEL_II',
    sort_order: 2,
    name: 'Dangal ng MTRC Award Level II',
    description:
      'This award is conferred to regular employee belonging to the second and first level for performance of an extraordinary act or public service and consistent demonstration of exemplary ethical behaviour based on the observance of the eight norms of behaviour provided under RA No. 6713',
    applies_to: 'permanent',
    nominee_type: 'individual',
    has_grant: 1,
    behavioral_indicators: [
      'Leadership',
      'Critical Thinking',
      'Integrity',
      'God-centeredness',
      'Nurturing',
      'Innovative',
      'Teamwork',
      'Excellence',
    ],
    tiers: [{ tier_label: 'Level II', max_amount: 10000, salary_grade_min: 12, salary_grade_max: null }],
  },
  {
    code: 'CUSTOMER_SVC',
    sort_order: 3,
    name: 'Excellence in Customer Service Award',
    description:
      'This award recognizes a Section/Committee with high focus of customer service programs in compliance with the MTRC Quality Policy which aims to continually improve quality management systems to the satisfaction of its clients and stakeholder',
    applies_to: 'both',
    nominee_type: 'section',
    has_grant: 1,
    behavioral_indicators: [
      'A strong commitment to implementing and sustaining customer service programs.',
      'Responsiveness and attentiveness to the needs of clients and stakeholders.',
      'Consistency in delivering services that meet or exceed expectations.',
      'Active compliance with the MTRC Quality Policy and continuous improvement practices.',
      'Collaboration and teamwork in enhancing service delivery.',
      'Innovation in addressing client concerns and improving service processes.',
      'Professionalism, courtesy, and accountability in all customer interactions.',
    ],
    tiers: [{ tier_label: 'Standard', max_amount: 20000, salary_grade_min: null, salary_grade_max: null }],
  },
  {
    code: 'AGAP_SERBISYO',
    sort_order: 4,
    name: 'Agap Serbisyo',
    description:
      'This award shall be given to employee who has demonstrated dedication to work by always being on time. He/She commits and delivers required outputs in a timely manner.',
    applies_to: 'cos',
    nominee_type: 'individual',
    has_grant: 0,
    behavioral_indicators: [
      'Punctuality and consistency in reporting to work on time.',
      'Reliability in meeting deadlines and completing assigned tasks promptly.',
      'Commitment to delivering quality outputs within the required time-frame.',
      'Dependability and accountability in fulfilling work responsibilities.',
      'A strong sense of discipline and professionalism in daily work performance.',
    ],
    tiers: [],
  },
  {
    code: 'SULONG_KALINANGAN',
    sort_order: 5,
    name: 'Sulong Kalinangan',
    description:
      "This award is granted to employee who exhibited passion for continuous learning and development by engaging in continuing formal education and/or non-formal training's. Given if he/she was able to apply his/her learning's to current practices of the Center resulting in more responsive, effective and efficient quality management system.",
    applies_to: 'both',
    nominee_type: 'individual',
    has_grant: 0,
    behavioral_indicators: [
      'Demonstrates passion and commitment to lifelong learning and professional growth.',
      'Actively engages in continuing formal education and/or non-formal training programs.',
      'Applies newly acquired knowledge and skills to current practices of the Center.',
      'Contributes to developing more responsive, effective, and efficient work processes.',
      "Enhances the Center's quality management system through innovative and practical improvements.",
    ],
    tiers: [],
  },
  {
    code: 'GAWAD_HIRAYA',
    sort_order: 6,
    name: 'Gawad Hiraya',
    description:
      "This award is granted to employee who have contributed to the continual improvement of the Center's quality management systems which resulted to the achivement of recognition, certification and accreditation from external bodies (ISO, PGS, PRIME HRM etc.)",
    applies_to: 'both',
    nominee_type: 'individual',
    has_grant: 0,
    behavioral_indicators: [
      "Actively contributes to the continual improvement of the Center's quality management systems.",
      'Demonstrates initiative and innovation in aligning processes with quality standards.',
      'Ensures compliance with established guidelines and best practices.',
      'Plays a key role in achieving external recognition, certification, and/or accreditation',
      'Shows commitment to sustaining high-quality service and organizational excellence.',
    ],
    tiers: [],
  },
]

// Selection period is November 1 to October 31. Nominations are submitted in the first quarter.
const awardCycles = [
  {
    name: 'CY 2026-2027',
    period_start: '2026-11-01',
    period_end: '2027-10-31',
    nomination_start: '2027-01-01',
    nomination_end: '2027-03-31',
    status: 'open',
  },
]

module.exports = { awardCategories, awardCycles }
