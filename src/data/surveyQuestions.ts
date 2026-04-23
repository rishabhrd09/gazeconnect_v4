import { SurveyQuestion, SurveyPhase } from '../types/SurveyTypes';

// ─── Unified 16-slot option builder (4 rows × 4 columns) ────
// Same options for every slot, ordered by row for intuitive placement.
// "Outer:" prefix = outdoor areas (green tint in UI).
// If a room is placed twice it means it occupies two slots (double width).
function getSlotOptions(row: 1 | 2 | 3 | 4, answers: Record<string, any>): string[] {
    const outer = [
        'Outer: Porch / Lawn',
        'Outer: Backyard / Utility',
    ];

    const building: string[] = [
        // ICU only in rows 2-4 (not front row), can occupy multiple slots
        ...(row >= 2 && answers['gf_req_home_icu'] === 'Yes' ? ['ICU + Caretaker Unit'] : []),
        'Bedroom',
        'Living Hall',
        'Drawing Room',
        'Kitchen + Store',
        'Dining',
        'Bathroom',
        ...(answers['num_floors'] !== 'Ground Only' ? ['Living Lobby + Staircase'] : []),
    ];

    // Keep kitchen visible in all slot-option sets for faster placement flow.
    // Repetition is allowed at survey stage; Compass Map refines final placement.
    const available = [...building];

    // Row 1 = outer first (front edge near road)
    // Row 2 & 3 = building first, but backyard still available at end
    // Row 4 = outer first (rear edge, backyard prominent)
    if (row === 1) {
        return [...outer, ...available];
    } else if (row === 4) {
        // Backyard first for rear row, then porch, then building
        return ['Outer: Backyard / Utility', 'Outer: Porch / Lawn', ...available];
    } else {
        // Rows 2 & 3: building first, outer options right after for visibility
        return [...available, ...outer];
    }
}

// ─── 8-Phase Structure ───────────────────────────────────────
export const SURVEY_PHASES_V2: SurveyPhase[] = [
    { id: 'Site',         label: 'Site',         icon: '\u{1F4D0}', questions: ['road_facing', 'plot_width', 'plot_depth', 'plot_type', 'second_road', 'footprint_layout', 'lshape_open_sides', 'setback_front', 'setback_rear', 'setback_sides'] },
    { id: 'Structure',    label: 'Structure',    icon: '\u{1F3D7}', questions: ['num_floors'] },
    { id: 'Ground Floor', label: 'Ground Floor', icon: '\u{1F3E0}', questions: ['gf_entry_type', 'gf_req_home_icu', 'gf_req_caregiver', 'gf_master_bedroom', 'gf_other_bedrooms', 'gf_living_config', 'gf_dining_config', 'gf_kitchen_config', 'gf_pooja', 'gf_bathrooms', 'gf_staircase', 'gf_ots'] },
    { id: 'Upper Floors', label: 'Upper Floors', icon: '\u{1F3E2}', questions: ['ff_requirements', 'ff_bedroom_count'] },
    { id: 'Dimensions',   label: 'Dimensions',   icon: '\u{1F4CF}', questions: ['size_gf_master', 'size_icu', 'size_caregiver', 'size_kitchen', 'size_drawing', 'size_living'] },
    { id: 'Layout',       label: 'Layout',       icon: '\u{1F5FA}', questions: ['plot_r1_s1', 'plot_r1_s2', 'plot_r1_s3', 'plot_r1_s4', 'plot_r2_s1', 'plot_r2_s2', 'plot_r2_s3', 'plot_r2_s4', 'plot_r3_s1', 'plot_r3_s2', 'plot_r3_s3', 'plot_r3_s4', 'plot_r4_s1', 'plot_r4_s2', 'plot_r4_s3', 'plot_r4_s4'] },
    { id: 'Flow',         label: 'Flow',         icon: '\u{1F6AA}', questions: ['zone_entrance', 'zone_kitchen', 'zone_master', 'zone_pooja', 'zone_staircase', 'zone_icu', 'main_door_into', 'second_door_into', 'kitchen_access', 'master_access', 'icu_access', 'corridor_width'] },
    { id: 'Finish',       label: 'Finish',       icon: '\u{2705}',  questions: ['vastu_level', 'vastu_kitchen_check', 'design_style', 'special_requests', 'final_notes', 'review_summary', 'confidence_level', 'submit_survey'] },
];

// Backward-compat flat phase list
export const SURVEY_PHASES = SURVEY_PHASES_V2.map(p => p.id);

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
    // ─── PHASE 1: SITE ──────────────────────────────────────────────
    // BUG 14/13: Road facing is FIRST question (sets orientation for everything)
    {
        id: 'road_facing',
        phase: 'Site',
        text: "Which direction does the MAIN ROAD face? (Which Side Facing)",
        subtext: "This sets the FRONT of your house and the orientation for all rooms. Choose the direction you face when standing on the road looking at your plot.",
        helpText: "Example: If the road is on the South side of your plot, select South Facing.",
        type: 'grid',
        options: ['North Facing', 'East Facing', 'South Facing', 'West Facing'],
        dataKey: 'road_facing'
    },
    {
        id: 'plot_width',
        phase: 'Site',
        text: "What is your PLOT WIDTH? (Left to Right)",
        subtext: "Measurement in feet along the road side.",
        type: 'grid',
        options: ['20 ft', '25 ft', '30 ft', '35 ft', '40 ft', '50 ft', '60 ft', 'Custom'],
        dataKey: 'plot_width_ft'
    },
    {
        id: 'plot_depth',
        phase: 'Site',
        text: "What is your PLOT DEPTH? (Front to Back)",
        subtext: "Measurement in feet from road to rear boundary.",
        type: 'grid',
        options: ['30 ft', '40 ft', '50 ft', '60 ft', '70 ft', '80 ft', '100 ft', 'Custom'],
        dataKey: 'plot_depth_ft'
    },
    {
        id: 'plot_type',
        phase: 'Site',
        text: "What type of plot is it?",
        type: 'grid',
        options: ['Corner Plot', 'Middle Plot', 'Three-side Open', 'Independent'],
        dataKey: 'plot_type'
    },
    {
        id: 'second_road',
        phase: 'Site',
        text: "Which side is the SECOND road on?",
        type: 'grid',
        options: ['North', 'South', 'East', 'West'],
        condition: (a) => a['plot_type'] === 'Corner Plot',
        dataKey: 'second_road_direction'
    },
    // BUG 11: Footprint / Setback questions
    {
        id: 'footprint_layout',
        phase: 'Site',
        text: "How should the house sit on the plot?",
        subtext: "Defines the open space between boundary wall and house walls.",
        type: 'grid',
        options: ['All-Around Open (Island)', 'L-Shaped Open Space', 'Front & Back Open Only', 'Front Only Open (Max Build)'],
        dataKey: 'footprint_layout'
    },
    {
        id: 'lshape_open_sides',
        phase: 'Site',
        text: "Which TWO sides should stay OPEN?",
        subtext: "The house will be pushed against the other two sides.",
        type: 'multi',
        options: ['Front', 'Back', 'Left Side', 'Right Side'],
        condition: (a) => (a['footprint_layout'] || '').includes('L-Shape'),
        dataKey: 'lshape_open_sides'
    },
    {
        id: 'setback_front',
        phase: 'Site',
        text: "FRONT setback \u2014 distance from road to house?",
        subtext: "Space for porch, garden, car parking, or driveway.",
        type: 'grid',
        options: ['3 ft', '5 ft', '8 ft', '10 ft', '12 ft', '15 ft'],
        dataKey: 'setback_front_ft'
    },
    {
        id: 'setback_rear',
        phase: 'Site',
        text: "REAR setback \u2014 distance at the back?",
        subtext: "Space for backyard, washing area, utility yard.",
        type: 'grid',
        options: ['0 ft (Wall-to-Wall)', '3 ft', '5 ft', '8 ft', '10 ft'],
        condition: (a) => !(a['footprint_layout'] || '').includes('Front Only'),
        dataKey: 'setback_rear_ft'
    },
    {
        id: 'setback_sides',
        phase: 'Site',
        text: "SIDE gaps \u2014 passage width on left/right?",
        subtext: "Space for side passage, drainage, or garden strip.",
        type: 'grid',
        options: ['0 ft (Wall-to-Wall)', '2 ft', '3 ft', '5 ft'],
        condition: (a) => ['All-Around Open', 'L-Shape'].some(x => (a['footprint_layout'] || '').includes(x)),
        dataKey: 'setback_side_ft'
    },

    // ─── PHASE 2: STRUCTURE ─────────────────────────────────────────
    {
        id: 'num_floors',
        phase: 'Structure',
        text: "How many floors?",
        subtext: "We will design the Ground Floor first.",
        type: 'grid',
        options: ['Ground Only', 'G+1 (Duplex)', 'G+2', 'Basement + G'],
        dataKey: 'num_floors'
    },

    // ─── PHASE 3: GROUND FLOOR ──────────────────────────────────────
    {
        id: 'gf_entry_type',
        phase: 'Ground Floor',
        text: "Entrance Configuration?",
        type: 'grid',
        options: ['Single Main Entry', 'Dual Entry (Front + Side)', 'Dual Entry (Front + Back)'],
        dataKey: 'gf_entry_type'
    },
    {
        id: 'gf_req_home_icu',
        phase: 'Ground Floor',
        text: "HOME ICU on Ground Floor?",
        subtext: "Specialized medical room for patient care.",
        helpText: "Includes space for medical equipment, oxygen, monitoring, and 24/7 caregiver access.",
        type: 'grid',
        options: ['Yes', 'No'],
        dataKey: 'gf_req_home_icu'
    },
    {
        id: 'gf_req_caregiver',
        phase: 'Ground Floor',
        text: "CAREGIVER ROOM? (Ground Floor)",
        subtext: "If ICU is 'Yes', this will be attached to it.",
        helpText: "Recommended when ICU is selected. Allows overnight caregiver proximity.",
        type: 'grid',
        options: ['Yes', 'No'],
        dataKey: 'gf_req_caregiver'
    },
    {
        id: 'gf_master_bedroom',
        phase: 'Ground Floor',
        text: "How many MASTER BEDROOMS? (Ground)",
        type: 'grid',
        options: ['1', 'None (Upper Floor)'],
        dataKey: 'gf_count_master_bedroom'
    },
    {
        id: 'gf_other_bedrooms',
        phase: 'Ground Floor',
        text: "Other BEDROOMS? (Ground)",
        subtext: "Guest, Parents, Kids",
        type: 'grid',
        options: ['0', '1', '2', '3'],
        dataKey: 'gf_count_other_bedrooms'
    },
    // BUG 12B: Expanded living options
    {
        id: 'gf_living_config',
        phase: 'Ground Floor',
        text: "LIVING Area Configuration?",
        type: 'grid',
        options: ['Large Living Hall Only', 'Drawing Room + Living Hall', 'Living + Family/TV Room', 'Drawing + Living + Family Room', 'Open Plan (Living+Dining+Kitchen)'],
        dataKey: 'gf_living_config'
    },
    // BUG 12C: Expanded dining options
    {
        id: 'gf_dining_config',
        phase: 'Ground Floor',
        text: "DINING Configuration?",
        type: 'grid',
        options: ['Separate Dining Room', 'Connected to Living Hall', 'Connected to Kitchen', 'Part of Open Plan', 'Dining in Verandah/Sit-out'],
        dataKey: 'gf_dining_config'
    },
    // BUG 12A: Expanded kitchen options
    {
        id: 'gf_kitchen_config',
        phase: 'Ground Floor',
        text: "KITCHEN Configuration?",
        type: 'grid',
        options: ['Closed Kitchen', 'Open Kitchen (to Living)', 'Open Kitchen (to Dining)', 'Kitchen + Utility Room', 'Kitchen + Pantry + Utility', 'Modular Kitchen with Island'],
        dataKey: 'gf_kitchen_config'
    },
    {
        id: 'gf_pooja',
        phase: 'Ground Floor',
        text: "POOJA Room?",
        type: 'grid',
        options: ['Yes (Separate)', 'Yes (Shelf/Niche)', 'No'],
        dataKey: 'gf_req_pooja'
    },
    // BUG 12D: Expanded bathroom options
    {
        id: 'gf_bathrooms',
        phase: 'Ground Floor',
        text: "BATHROOM Configuration? (Ground Floor)",
        subtext: "Select all bathroom types needed.",
        type: 'multi',
        options: [
            'Attached to Master (with Dressing)',
            'Attached to Master (Standard)',
            'Attached to Guest Room',
            'Common Bathroom (near Living)',
            'Powder Room (near Entrance)',
            'Bathroom near ICU (Accessible)',
            'Staff/Service Bathroom'
        ],
        dataKey: 'gf_bathroom_config'
    },
    // BUG 12E: Expanded staircase options
    {
        id: 'gf_staircase',
        phase: 'Ground Floor',
        text: "STAIRCASE Configuration?",
        type: 'grid',
        options: ['Internal (Center)', 'Internal (Side)', 'External (Side)', 'External (Rear)', 'Lift + Staircase', 'No Staircase (Ground Only)'],
        condition: (a) => a['num_floors'] !== 'Ground Only',
        dataKey: 'gf_req_staircase'
    },
    // BUG 12F: OTS question
    {
        id: 'gf_ots',
        phase: 'Ground Floor',
        text: "Open-to-Sky (OTS) ventilation shaft?",
        subtext: "Internal courtyard or light well for deep plots where center rooms get dark.",
        helpText: "Recommended for plots deeper than 50 ft to bring natural light to interior rooms.",
        type: 'grid',
        options: ['Yes (Large Courtyard)', 'Yes (Small Light Well)', 'No', 'Let Architect Decide'],
        condition: (a) => parseInt((a['plot_depth_ft'] || '0').replace(/\D/g, '') || '0') >= 50,
        dataKey: 'gf_ots'
    },

    // ─── PHASE 4: UPPER FLOORS (Conditional) ────────────────────────
    {
        id: 'ff_requirements',
        phase: 'Upper Floors',
        text: "FIRST FLOOR Requirements?",
        subtext: "Select what goes upstairs.",
        type: 'multi',
        options: ['Master Bedroom (Upper)', 'Kids Bedrooms', 'Family Lounge', 'Study/Office', 'Balconies', 'Home Theater', 'Terrace Garden'],
        condition: (a) => a['num_floors'] !== 'Ground Only',
        dataKey: 'ff_requirements_list'
    },
    {
        id: 'ff_bedroom_count',
        phase: 'Upper Floors',
        text: "How many BEDROOMS on First Floor?",
        type: 'grid',
        options: ['1', '2', '3', '4'],
        condition: (a) => a['num_floors'] !== 'Ground Only',
        dataKey: 'ff_count_bedrooms'
    },

    // ─── PHASE 5: DIMENSIONS ────────────────────────────────────────
    {
        id: 'size_gf_master',
        phase: 'Dimensions',
        text: "Ground MASTER BEDROOM Size?",
        type: 'grid',
        options: ['12x12', '12x14', '14x16', '16x20', 'Custom'],
        condition: (a) => a['gf_count_master_bedroom'] === '1',
        dataKey: 'dim_gf_master'
    },
    {
        id: 'size_icu',
        phase: 'Dimensions',
        text: "HOME ICU Size?",
        type: 'grid',
        options: ['12x14 (Std)', '14x16 (Large)', '16x18 (Suite)'],
        condition: (a) => a['gf_req_home_icu'] === 'Yes',
        dataKey: 'dim_icu'
    },
    {
        id: 'size_caregiver',
        phase: 'Dimensions',
        text: "CAREGIVER Room Size?",
        type: 'grid',
        options: ['8x8', '8x10', '10x10'],
        condition: (a) => a['gf_req_caregiver'] === 'Yes',
        dataKey: 'dim_caregiver'
    },
    {
        id: 'size_kitchen',
        phase: 'Dimensions',
        text: "KITCHEN Size?",
        type: 'grid',
        options: ['8x10', '10x10', '10x12', '12x14'],
        dataKey: 'dim_kitchen'
    },
    {
        id: 'size_drawing',
        phase: 'Dimensions',
        text: "DRAWING ROOM Size?",
        type: 'grid',
        options: ['12x14', '14x16', '16x18', '18x20'],
        dataKey: 'dim_drawing'
    },
    {
        id: 'size_living',
        phase: 'Dimensions',
        text: "LIVING HALL Size?",
        type: 'grid',
        options: ['14x16', '16x18', '18x20', '20x24'],
        dataKey: 'dim_living'
    },

    // ─── PHASE 6: LAYOUT (16 unified plot slots — 4 rows × 4 columns) ──
    // Placing the same room in two slots means it occupies double width.
    // Row 1 (Front of plot, closest to road)
    { id: 'plot_r1_s1', phase: 'Layout', text: "Row 1 (Front) \u2014 Slot 1",  subtext: "Front-left area of your plot, closest to the road.",     type: 'grid', dynamicOptions: (a) => getSlotOptions(1, a), dataKey: 'plot_r1_s1' },
    { id: 'plot_r1_s2', phase: 'Layout', text: "Row 1 (Front) \u2014 Slot 2",  subtext: "Front center-left of your plot, facing the road.",       type: 'grid', dynamicOptions: (a) => getSlotOptions(1, a), dataKey: 'plot_r1_s2' },
    { id: 'plot_r1_s3', phase: 'Layout', text: "Row 1 (Front) \u2014 Slot 3",  subtext: "Front center-right of your plot, facing the road.",      type: 'grid', dynamicOptions: (a) => getSlotOptions(1, a), dataKey: 'plot_r1_s3' },
    { id: 'plot_r1_s4', phase: 'Layout', text: "Row 1 (Front) \u2014 Slot 4",  subtext: "Front-right area of your plot, closest to the road.",    type: 'grid', dynamicOptions: (a) => getSlotOptions(1, a), dataKey: 'plot_r1_s4' },
    // Row 2 (Front-Mid)
    { id: 'plot_r2_s1', phase: 'Layout', text: "Row 2 (Front-Mid) \u2014 Slot 1",  subtext: "Behind the front row, left side.",                   type: 'grid', dynamicOptions: (a) => getSlotOptions(2, a), dataKey: 'plot_r2_s1' },
    { id: 'plot_r2_s2', phase: 'Layout', text: "Row 2 (Front-Mid) \u2014 Slot 2",  subtext: "Behind the front row, center-left.",                 type: 'grid', dynamicOptions: (a) => getSlotOptions(2, a), dataKey: 'plot_r2_s2' },
    { id: 'plot_r2_s3', phase: 'Layout', text: "Row 2 (Front-Mid) \u2014 Slot 3",  subtext: "Behind the front row, center-right.",                type: 'grid', dynamicOptions: (a) => getSlotOptions(2, a), dataKey: 'plot_r2_s3' },
    { id: 'plot_r2_s4', phase: 'Layout', text: "Row 2 (Front-Mid) \u2014 Slot 4",  subtext: "Behind the front row, right side.",                  type: 'grid', dynamicOptions: (a) => getSlotOptions(2, a), dataKey: 'plot_r2_s4' },
    // Row 3 (Rear-Mid)
    { id: 'plot_r3_s1', phase: 'Layout', text: "Row 3 (Rear-Mid) \u2014 Slot 1",  subtext: "Toward the back of the plot, left side.",             type: 'grid', dynamicOptions: (a) => getSlotOptions(3, a), dataKey: 'plot_r3_s1' },
    { id: 'plot_r3_s2', phase: 'Layout', text: "Row 3 (Rear-Mid) \u2014 Slot 2",  subtext: "Toward the back of the plot, center-left.",           type: 'grid', dynamicOptions: (a) => getSlotOptions(3, a), dataKey: 'plot_r3_s2' },
    { id: 'plot_r3_s3', phase: 'Layout', text: "Row 3 (Rear-Mid) \u2014 Slot 3",  subtext: "Toward the back of the plot, center-right.",          type: 'grid', dynamicOptions: (a) => getSlotOptions(3, a), dataKey: 'plot_r3_s3' },
    { id: 'plot_r3_s4', phase: 'Layout', text: "Row 3 (Rear-Mid) \u2014 Slot 4",  subtext: "Toward the back of the plot, right side.",            type: 'grid', dynamicOptions: (a) => getSlotOptions(3, a), dataKey: 'plot_r3_s4' },
    // Row 4 (Rear of plot, farthest from road)
    { id: 'plot_r4_s1', phase: 'Layout', text: "Row 4 (Rear) \u2014 Slot 1",  subtext: "Rear-left area, farthest from the road.",                 type: 'grid', dynamicOptions: (a) => getSlotOptions(4, a), dataKey: 'plot_r4_s1' },
    { id: 'plot_r4_s2', phase: 'Layout', text: "Row 4 (Rear) \u2014 Slot 2",  subtext: "Rear center-left, farthest from the road.",               type: 'grid', dynamicOptions: (a) => getSlotOptions(4, a), dataKey: 'plot_r4_s2' },
    { id: 'plot_r4_s3', phase: 'Layout', text: "Row 4 (Rear) \u2014 Slot 3",  subtext: "Rear center-right, farthest from the road.",              type: 'grid', dynamicOptions: (a) => getSlotOptions(4, a), dataKey: 'plot_r4_s3' },
    { id: 'plot_r4_s4', phase: 'Layout', text: "Row 4 (Rear) \u2014 Slot 4",  subtext: "Rear-right area, farthest from the road.",                type: 'grid', dynamicOptions: (a) => getSlotOptions(4, a), dataKey: 'plot_r4_s4' },

    // ─── PHASE 7: FLOW (Compass zones + Connections) ────────────────
    {
        id: 'zone_entrance',
        phase: 'Flow',
        text: "MAIN ENTRANCE Position?",
        type: 'grid',
        options: ['Center', 'Left of Center', 'Right of Center', 'Far Left', 'Far Right'],
        dataKey: 'zone_entrance'
    },
    {
        id: 'zone_kitchen',
        phase: 'Flow',
        text: "KITCHEN Zone?",
        subtext: "Vastu: SE (Ideal). NE (Good).",
        helpText: "Kitchen placement affects ventilation and Vastu energy flow. SE is ideal for fire element.",
        type: 'grid',
        options: ['South East', 'North East', 'Other'],
        dataKey: 'zone_kitchen'
    },
    {
        id: 'zone_master',
        phase: 'Flow',
        text: "MASTER BEDROOM Zone?",
        subtext: "Vastu: SW (Ideal).",
        type: 'grid',
        options: ['South West', 'South East', 'North West', 'Other'],
        condition: (a) => a['gf_count_master_bedroom'] === '1',
        dataKey: 'zone_master'
    },
    {
        id: 'zone_pooja',
        phase: 'Flow',
        text: "POOJA ROOM Zone?",
        subtext: "Vastu: NE (Ideal).",
        type: 'grid',
        options: ['North East', 'North West', 'Center', 'Other'],
        condition: (a) => (a['gf_req_pooja'] || '').includes('Yes'),
        dataKey: 'zone_pooja'
    },
    {
        id: 'zone_staircase',
        phase: 'Flow',
        text: "STAIRCASE Position?",
        subtext: "Vastu: SW, South, or West.",
        type: 'grid',
        options: ['South West', 'South', 'West', 'Other'],
        condition: (a) => (a['gf_req_staircase'] || '').includes('Internal') || (a['gf_req_staircase'] || '').includes('Lift'),
        dataKey: 'zone_staircase'
    },
    {
        id: 'zone_icu',
        phase: 'Flow',
        text: "HOME ICU Position?",
        subtext: "Should be easily accessible from entrance.",
        helpText: "Place near entrance for emergency access. Avoid upper floors for wheelchair/gurney accessibility.",
        type: 'grid',
        options: ['North East', 'South East', 'Near Entrance', 'Other'],
        condition: (a) => a['gf_req_home_icu'] === 'Yes',
        dataKey: 'zone_icu'
    },
    // BUG 8: Expanded main door options + dual entry support
    {
        id: 'main_door_into',
        phase: 'Flow',
        text: "MAIN DOOR opens into?",
        type: 'grid',
        options: ['Foyer', 'Drawing Room', 'Living Hall', 'Corridor', 'Verandah', 'Porch', 'Open Lobby', 'Sit-out Area'],
        dataKey: 'main_door_into'
    },
    // BUG 8: Second entrance (conditional on dual entry)
    {
        id: 'second_door_into',
        phase: 'Flow',
        text: "SECOND ENTRANCE opens into?",
        subtext: "The secondary/service entry.",
        type: 'grid',
        options: ['Corridor', 'Kitchen', 'Utility Area', 'Side Garden', 'Backyard', 'Caretaker Area', 'Service Area'],
        condition: (a) => (a['gf_entry_type'] || '').includes('Dual'),
        dataKey: 'second_door_into'
    },
    {
        id: 'kitchen_access',
        phase: 'Flow',
        text: "KITCHEN is accessed from?",
        type: 'grid',
        options: ['Dining Room', 'Living Hall', 'Corridor', 'Utility Area'],
        dataKey: 'kitchen_access'
    },
    {
        id: 'master_access',
        phase: 'Flow',
        text: "MASTER BEDROOM accessed from?",
        type: 'grid',
        options: ['Corridor', 'Living Hall', 'Private Passage'],
        condition: (a) => a['gf_count_master_bedroom'] === '1',
        dataKey: 'master_access'
    },
    {
        id: 'icu_access',
        phase: 'Flow',
        text: "HOME ICU accessed from?",
        type: 'grid',
        options: ['Living Hall', 'Corridor', 'Direct External Access'],
        condition: (a) => a['gf_req_home_icu'] === 'Yes',
        dataKey: 'icu_access'
    },
    // BUG 9: Corridor width clarified
    {
        id: 'corridor_width',
        phase: 'Flow',
        text: "CORRIDOR/PASSAGE Width?",
        subtext: "Internal passage connecting rooms. Wider = wheelchair accessible.",
        helpText: "4 ft minimum recommended for wheelchair access. 5 ft allows two people to pass comfortably.",
        type: 'grid',
        options: ['3 ft (Tight)', '3.5 ft (Standard)', '4 ft (Comfortable)', '5 ft (Wheelchair-friendly)', 'No Corridor (Open Plan)'],
        dataKey: 'corridor_width_ft'
    },

    // ─── PHASE 8: FINISH (Soul + Extras + Review) ───────────────────
    {
        id: 'vastu_level',
        phase: 'Finish',
        text: "How strictly follow VASTU?",
        type: 'grid',
        options: ['Strict', 'Moderate', 'Flexible', 'Skip Vastu'],
        defaultValue: 'Moderate',
        dataKey: 'vastu_level'
    },
    {
        id: 'vastu_kitchen_check',
        phase: 'Finish',
        text: "Kitchen Vastu Check",
        subtext: "Confirming SE corner implementation.",
        type: 'display',
        options: ['Good'],
        condition: (a) => a['vastu_level'] !== 'Skip Vastu',
        dataKey: 'vastu_check_kitchen'
    },
    {
        id: 'design_style',
        phase: 'Finish',
        text: "Overall DESIGN STYLE?",
        type: 'grid',
        options: ['Modern Minimalist', 'Traditional Indian', 'Contemporary', 'Compact', 'Luxury'],
        dataKey: 'design_style'
    },
    {
        id: 'special_requests',
        phase: 'Finish',
        text: "Any SPECIAL REQUESTS?",
        subtext: "Use keyboard to type or skip.",
        type: 'text',
        dataKey: 'special_requests'
    },
    {
        id: 'final_notes',
        phase: 'Finish',
        text: "FINAL NOTES for Architect?",
        type: 'text',
        dataKey: 'final_notes'
    },
    {
        id: 'review_summary',
        phase: 'Finish',
        text: "SURVEY COMPLETE. Review your choices.",
        type: 'scrollable-display',
        dataKey: 'review_seen'
    },
    {
        id: 'confidence_level',
        phase: 'Finish',
        text: "How confident are you?",
        type: 'grid',
        options: ['Very Confident', 'Somewhat', 'Just a Draft'],
        dataKey: 'confidence'
    },
    {
        id: 'submit_survey',
        phase: 'Finish',
        text: "READY TO GENERATE?",
        subtext: "This will save your data and start the AI engine.",
        type: 'action',
        options: ['GENERATE PLAN', 'Save & Quit'],
        dataKey: 'submit_action'
    }
];
