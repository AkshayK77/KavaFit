import React, { useState, useRef, useEffect } from 'react'
import { BodyChart, ViewSide } from 'body-muscles'
import type { BodyState } from 'body-muscles'
import ExerciseModal from '../components/ExerciseModal'
import { useIsMobile } from '../hooks/useIsMobile'

interface MuscleData {
  name: string
  subtitle: string
  badge: string
  desc: string
  exercises: string[]
  recovery?: string
  injury?: string
}

interface NutrientData {
  id: string
  name: string
  icon: 'bolt' | 'shield' | 'bone' | 'drop'
  summary: string
  whyItMatters: string
  deficiency: string
  timing: string
  supplement?: string
  foods: string[]
  muscles: string[]
}

const GROUPS = [
  { parts: ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'neck', 'abs', 'quads', 'hamstrings', 'glutes', 'adductors', 'hip_flexors', 'calves'] },
]

const PART_LABELS: Record<string, string> = {
  chest: 'Chest', shoulders: 'Shoulders', triceps: 'Triceps',
  back: 'Back', biceps: 'Biceps', forearms: 'Forearms',
  neck: 'Neck', abs: 'Abs / Core',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  adductors: 'Adductors', hip_flexors: 'Hip Flexors', calves: 'Calves',
}

const DATA: Record<string, MuscleData[]> = {
  chest: [
    {
      name: 'Pectoralis Major', subtitle: 'Clavicular & Sternal heads',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Pec major tear at the sternal head during max-effort bench — warm up thoroughly and avoid extreme bottom-of-rep stretching under heavy load.',
      desc: 'The largest chest muscle, responsible for horizontal adduction and flexion of the arm. The clavicular head handles upper-chest pressing, while the sternal head dominates flat and decline movements.',
      exercises: ['Bench Press', 'Incline Press', 'Cable Fly', 'Dumbbell Fly', 'Push-Up'],
    },
    {
      name: 'Pectoralis Minor', subtitle: 'Deep stabiliser',
      badge: 'Stabiliser',
      recovery: '48–72 hrs',
      injury: 'Pec minor strain causing anterior shoulder pain and scapular tipping — maintain scapular mobility and avoid excessive protraction under load.',
      desc: 'A small muscle beneath the pec major that protracts and depresses the scapula. Key for shoulder health and proper pressing mechanics.',
      exercises: ['Dip', 'Push-Up Plus', 'Serratus Crunch'],
    },
  ],
  shoulders: [
    {
      name: 'Anterior Deltoid', subtitle: 'Front head',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Anterior shoulder impingement from pressing overload — balance pushing volume with pulling and rear delt work to avoid chronic inflammation.',
      desc: 'Drives shoulder flexion and internal rotation. Heavily recruited during overhead pressing and front raises. Often over-developed relative to other delt heads.',
      exercises: ['Overhead Press', 'Front Raise', 'Arnold Press', 'Incline Press'],
    },
    {
      name: 'Lateral Deltoid', subtitle: 'Middle head',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Lateral deltoid strain from swinging heavy lateral raises — use strict form, controlled tempo, and avoid ego weight on isolation movements.',
      desc: 'Creates shoulder width and is the target of lateral raises. Only active during abduction above the horizontal plane when the arm is internally rotated.',
      exercises: ['Lateral Raise', 'Upright Row', 'Machine Lateral', 'Cable Lateral'],
    },
    {
      name: 'Posterior Deltoid', subtitle: 'Rear head',
      badge: 'Often Neglected',
      recovery: '48–72 hrs',
      injury: 'Neglecting the rear delts leads to rounded-shoulder posture and shoulder impingement — include face pulls and band pull-aparts in every upper-body session.',
      desc: 'Critical for shoulder health and posture. Retracts and externally rotates the arm. Commonly undertrained, leading to rounded-shoulder posture.',
      exercises: ['Face Pull', 'Rear Delt Fly', 'Reverse Pec Deck', 'Band Pull-Apart'],
    },
  ],
  triceps: [
    {
      name: 'Triceps Long Head', subtitle: 'Largest of three heads',
      badge: 'Mass Builder',
      recovery: '24–48 hrs',
      injury: 'Triceps tendon strain at the olecranon from heavy overhead extensions — warm up the elbow joint thoroughly and avoid locking out explosively.',
      desc: 'The only tri-articular head, crossing both the shoulder and elbow. Best stretched and loaded with overhead extensions. Accounts for ~60% of triceps mass.',
      exercises: ['Overhead Triceps Extension', 'Skull Crusher', 'Close-Grip Bench'],
    },
    {
      name: 'Triceps Lateral Head', subtitle: 'Outer head',
      badge: 'Definition',
      recovery: '24–48 hrs',
      injury: 'Lateral epicondylitis (tennis elbow) from high-volume pushdowns — vary grip angle and manage total elbow extension volume across the week.',
      desc: 'Gives the triceps its horseshoe shape when developed. Most active during pushdowns with a pronated grip. Does not cross the shoulder joint.',
      exercises: ['Pushdown', 'Dip', 'Bench Press Lockout'],
    },
    {
      name: 'Triceps Medial Head', subtitle: 'Deep inner head',
      badge: 'Stabiliser',
      recovery: '24–48 hrs',
      injury: 'Medial elbow pain from accumulated elbow extension overuse — monitor total weekly pressing volume and ensure full recovery between sessions.',
      desc: 'Active throughout the entire range of elbow extension. Provides the foundation for all triceps movements, especially the final degrees of lockout.',
      exercises: ['Reverse Grip Pushdown', 'Diamond Push-Up', 'Close-Grip Bench'],
    },
  ],
  back: [
    {
      name: 'Latissimus Dorsi', subtitle: 'Wing muscle',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Lat strain during heavy rows or pull-ups, often at the teres major junction — avoid pulling through a fatigued shoulder and warm up with band pull-aparts.',
      desc: 'The widest muscle in the body. Responsible for shoulder adduction, extension, and internal rotation. Determines back width and the coveted V-taper.',
      exercises: ['Pull-Up', 'Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Single-Arm Row'],
    },
    {
      name: 'Trapezius', subtitle: 'Upper, middle, lower fibres',
      badge: 'Multi-Function',
      recovery: '48–72 hrs',
      injury: 'Upper trap strain and chronic tension headaches from heavy shrugs with poor ROM — use full range of motion and avoid hitching or rolling the shoulders.',
      desc: 'A large diamond-shaped muscle with three distinct regions. Upper traps elevate the scapula; middle traps retract it; lower traps depress it. Critical for all overhead movements.',
      exercises: ['Shrug', 'Face Pull', 'Bent-Over Row', 'Y-Raise'],
    },
    {
      name: 'Rhomboids', subtitle: 'Scapular retractors',
      badge: 'Posture',
      recovery: '48–72 hrs',
      injury: 'Rhomboid strain causing sharp pain between the shoulder blades — avoid rounding the upper back under heavy row loads and brace the scapula before each pull.',
      desc: 'Retract and rotate the scapula downward. Counteract the forward pull of the pecs and anterior deltoids. Essential for good posture and shoulder health.',
      exercises: ['Seated Cable Row', 'Band Pull-Apart', 'Face Pull', 'Bent-Over Row'],
    },
    {
      name: 'Teres Major', subtitle: "Lat's little helper",
      badge: 'Mass Builder',
      recovery: '48–72 hrs',
      injury: 'Posterior shoulder strain from heavy internal rotation under load — always warm up with external rotation work before pulling sessions.',
      desc: "Often grouped with the lats, the teres major assists in shoulder extension, adduction, and internal rotation. It contributes meaningfully to back thickness and activates heavily in any pulling movement where the elbow drives toward the hip.",
      exercises: ['Pull-Up', 'Lat Pulldown', 'Single-Arm Row', 'Straight-Arm Pulldown'],
    },
    {
      name: 'Rotator Cuff', subtitle: 'Supraspinatus, Infraspinatus, Teres Minor, Subscapularis',
      badge: 'Foundation',
      recovery: '48–72 hrs',
      injury: 'Supraspinatus impingement or tear — the most common serious shoulder injury in lifters; never skip external rotation warm-up work before any pressing session.',
      desc: 'Four deep muscles that stabilise the humeral head in the shoulder socket. The supraspinatus initiates abduction; the infraspinatus and teres minor externally rotate; the subscapularis internally rotates. Neglecting them is the leading cause of shoulder injuries in pressing athletes.',
      exercises: ['Face Pull', 'Band External Rotation', 'Cable External Rotation', 'Cuban Press', 'Y-T-W Raise'],
    },
    {
      name: 'Erector Spinae', subtitle: 'Spinal stabilisers',
      badge: 'Foundation',
      recovery: '48–72 hrs',
      injury: 'Lower back strain from losing neutral spine under load — brace the core before every rep and never round the lumbar spine in deadlifts or squats.',
      desc: 'Three columns of muscle running along the spine. Extend and laterally flex the trunk. The foundation of all compound lifts — they keep the spine neutral under load.',
      exercises: ['Deadlift', 'Romanian Deadlift', 'Back Extension', 'Good Morning'],
    },
  ],
  biceps: [
    {
      name: 'Biceps Brachii', subtitle: 'Long & short head',
      badge: 'Primary Mover',
      recovery: '24–48 hrs',
      injury: 'Distal biceps tendon tear from supinated lifts under maximal load — avoid sudden jerking movements and use full control through the eccentric.',
      desc: 'A two-headed muscle that flexes the elbow and supinates the forearm. The long head creates the peak; the short head builds width. Best developed with supination under load.',
      exercises: ['Barbell Curl', 'Dumbbell Curl', 'Incline Curl', 'Cable Curl', 'Chin-Up'],
    },
    {
      name: 'Brachialis', subtitle: 'Deep elbow flexor',
      badge: 'Thickness',
      recovery: '24–48 hrs',
      injury: 'Brachialis strain causing deep anterior elbow pain — avoid spiking hammer curl volume and warm up with light elbow flexion before heavy arm work.',
      desc: 'Lies beneath the biceps and is the strongest elbow flexor. Developed with neutral-grip movements. Building it pushes the biceps up, increasing peak height.',
      exercises: ['Hammer Curl', 'Neutral-Grip Chin-Up', 'Cross-Body Curl'],
    },
  ],
  forearms: [
    {
      name: 'Forearm Flexor Group', subtitle: 'Wrist & finger flexors',
      badge: 'Primary Mover',
      recovery: '24–48 hrs',
      injury: 'Medial epicondylitis (golfer\'s elbow) from gripping overload — manage grip-intensive volume, stretch wrist flexors daily, and avoid death-gripping the bar.',
      desc: 'Includes flexor carpi radialis/ulnaris, palmaris longus, and flexor digitorum muscles. Responsible for wrist flexion and gripping strength.',
      exercises: ['Wrist Curl', 'Behind-the-Back Wrist Curl', 'Farmer Carry', 'Towel Pull-Up'],
    },
    {
      name: 'Forearm Extensor Group', subtitle: 'Wrist & finger extensors',
      badge: 'Often Neglected',
      recovery: '24–48 hrs',
      injury: 'Lateral epicondylitis (tennis elbow) from repetitive gripping and wrist extension overuse — stretch extensors frequently and progress reverse curl load gradually.',
      desc: 'Extensor carpi radialis longus/brevis, extensor carpi ulnaris, and extensor digitorum. Balances the flexors and protects the elbow and wrist.',
      exercises: ['Reverse Wrist Curl', 'Rubber Band Finger Extension', 'EZ-Bar Reverse Curl'],
    },
    {
      name: 'Brachioradialis', subtitle: 'Forearm elbow flexor',
      badge: 'Mass Builder',
      recovery: '24–48 hrs',
      injury: 'Brachioradialis strain from excessive reverse curl volume — progress load incrementally and avoid training this muscle when the elbow is already fatigued.',
      desc: 'Thickens the top of the forearm and assists elbow flexion in neutral grips. Highly active in hammer-style movements.',
      exercises: ['Hammer Curl', 'Cross-Body Curl', 'Reverse Curl'],
    },
    {
      name: 'Pronators & Supinator', subtitle: 'Rotation control',
      badge: 'Stabiliser',
      recovery: '24–48 hrs',
      injury: 'Pronator teres syndrome causing deep forearm pain — avoid sustained pronation under heavy load and include wrist rotation mobility work in your warm-up.',
      desc: 'Pronator teres/quadratus and the supinator rotate the forearm. Essential for elbow stability and wrist health in pressing and pulling.',
      exercises: ['Dumbbell Pronation/Supination', 'Hammer Rotation', 'Cable Pronation'],
    },
  ],
  neck: [
    {
      name: 'Sternocleidomastoid', subtitle: 'SCM — primary neck flexor',
      badge: 'Primary Mover',
      recovery: '24–48 hrs',
      injury: 'SCM strain causing neck pain and tension headaches — always warm up the neck with gentle ROM before direct neck training and avoid jerky movements.',
      desc: 'The large paired muscle running from the sternum and clavicle to the mastoid process behind the ear. Flexes and rotates the head and neck. Visible from the front as the defining neck muscle. Trained by resisted neck flexion and wrestler bridges.',
      exercises: ['Neck Flexion (plate/band)', 'Wrestler Bridge', 'Neck Harness Flexion'],
    },
    {
      name: 'Splenius Capitis & Cervicis', subtitle: 'Neck extensors',
      badge: 'Often Neglected',
      recovery: '24–48 hrs',
      injury: 'Cervical strain from excessive neck extension load — use light resistance only, prioritise full control over the weight, and never rush progression.',
      desc: 'Run diagonally from the upper thoracic spine to the base of the skull. Extend and rotate the head and neck. Often undertrained despite being directly loaded during heavy deadlifts and squats.',
      exercises: ['Neck Extension (plate/band)', 'Neck Harness Extension', 'Deadlift', 'Back Squat'],
    },
    {
      name: 'Levator Scapulae', subtitle: 'Neck-to-shoulder connector',
      badge: 'Posture',
      recovery: '24–48 hrs',
      injury: 'Chronic levator scapulae tightness causing neck and shoulder stiffness — stretch regularly, avoid one-sided load carrying, and address desk posture.',
      desc: 'Connects the upper cervical vertebrae to the scapula. Elevates and downwardly rotates the scapula and laterally flexes the neck. Chronically tight in desk workers; a common source of neck and shoulder stiffness.',
      exercises: ['Neck Lateral Flexion Stretch', 'Shrug', 'Farmer Carry', 'Band Neck Lateral'],
    },
  ],
  abs: [
    {
      name: 'Rectus Abdominis', subtitle: 'The "six-pack" muscle',
      badge: 'Primary Mover',
      recovery: '24–48 hrs',
      injury: 'Hip flexor dominance masking poor ab activation, leading to lower back stress — focus on posterior pelvic tilt and avoid pulling on the neck during crunches.',
      desc: 'A long paired muscle running vertically from the pubis to the sternum. Its primary action is spinal flexion. The visible segmentation is created by tendinous intersections, not by having separate muscles. Best trained through full spinal flexion under load.',
      exercises: ['Crunch', 'Cable Crunch', 'Hanging Leg Raise', 'Ab Wheel Rollout', 'Decline Sit-Up'],
    },
    {
      name: 'External Obliques', subtitle: 'Outer rotators',
      badge: 'Multi-Function',
      recovery: '24–48 hrs',
      injury: 'Oblique strain from rotational movements with excessive load — build rotation strength progressively and control the eccentric phase on all woodchops and twists.',
      desc: 'The outermost abdominal layer, running diagonally from the lower ribs to the iliac crest. Produce trunk rotation toward the opposite side, lateral flexion, and assist in spinal flexion. The largest of the abdominal muscles.',
      exercises: ['Woodchop', 'Russian Twist', 'Side Plank', 'Pallof Press', 'Bicycle Crunch'],
    },
    {
      name: 'Internal Obliques', subtitle: 'Deep rotators',
      badge: 'Stabiliser',
      recovery: '24–48 hrs',
      injury: 'Internal oblique strain from twisting under heavy load — control the eccentric phase of all rotational exercises and avoid combining rotation with spinal flexion.',
      desc: 'Run perpendicular to the external obliques, just beneath them. Rotate the trunk toward the same side and laterally flex the spine. Work synergistically with the opposite external oblique in all rotational movements.',
      exercises: ['Woodchop', 'Pallof Press', 'Side Plank', 'Cable Rotation', 'Landmine Twist'],
    },
    {
      name: 'Transverse Abdominis', subtitle: 'Deep core stabiliser',
      badge: 'Foundation',
      recovery: '24–48 hrs',
      injury: 'TVA inhibition after lower back injury allows the spine to lose stability under load — consciously brace the deep core before every heavy lift, especially after any back pain.',
      desc: 'The deepest abdominal muscle, wrapping around the trunk like a corset. Does not produce visible movement — instead it increases intra-abdominal pressure and stiffens the lumbar spine. The first muscle to activate before any limb movement. Essential for spinal protection under heavy load.',
      exercises: ['Dead Bug', 'Plank', 'Pallof Press', 'Vacuum Hold', 'Bird Dog'],
    },
    {
      name: 'Serratus Anterior', subtitle: 'Rib cage serrations',
      badge: 'Often Neglected',
      recovery: '24–48 hrs',
      injury: 'Serratus weakness causing scapular winging and shoulder impingement — include push-up plus and serratus crunches in every pressing program.',
      desc: 'Originates from the lateral ribs and inserts on the medial border of the scapula. Protracts and upwardly rotates the scapula — critical for keeping it flush against the rib cage. Weakness causes "winging" of the scapula and disrupts all pressing and overhead movement patterns.',
      exercises: ['Push-Up Plus', 'Serratus Crunch', 'Overhead Press', 'Ab Wheel Rollout', 'Cable Serratus Crunch'],
    },
  ],
  quads: [
    {
      name: 'Rectus Femoris', subtitle: 'Central quad head',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Quad strain at the hip-knee junction from sprinting or kicking — mobilise the hip flexors before any high-speed lower-body work.',
      desc: 'The only quad head that crosses the hip joint, making it a hip flexor as well. Best targeted with leg extensions and hack squats with a forward lean.',
      exercises: ['Leg Extension', 'Hack Squat', 'Bulgarian Split Squat'],
    },
    {
      name: 'Vastus Lateralis', subtitle: 'Outer sweep',
      badge: 'Mass & Width',
      recovery: '48–72 hrs',
      injury: 'IT band tightness causing lateral knee pain from VL overuse — foam roll the outer quad regularly and avoid sudden spikes in squat volume.',
      desc: 'The largest of the four quad heads, located on the outer thigh. Creates the teardrop shape from the side. Best loaded in the lengthened position with a deeper squat.',
      exercises: ['Squat', 'Leg Press', 'Walking Lunge', 'Leg Extension'],
    },
    {
      name: 'Vastus Medialis', subtitle: 'Teardrop muscle',
      badge: 'Knee Health',
      recovery: '48–72 hrs',
      injury: 'Patellar tendinopathy and poor knee tracking from VMO weakness — include terminal knee extensions and step-ups to maintain patellar stability.',
      desc: 'The inner quad head that creates the teardrop near the knee. Critical for knee tracking and patellar stability. Best targeted with terminal knee extension and narrow stances.',
      exercises: ['Terminal Knee Extension', 'Step-Up', 'Narrow Squat', 'Leg Extension (final 30°)'],
    },
    {
      name: 'Vastus Intermedius', subtitle: 'Deep middle head',
      badge: 'Stabiliser',
      recovery: '48–72 hrs',
      injury: 'Quad tendon strain from rapid load increases in squatting volume — progress conservatively and monitor any anterior knee pain as an early warning sign.',
      desc: 'The deepest of the four quad heads, lying beneath the rectus femoris directly on the femur. It cannot be isolated and is only accessible through compound knee extension. Contributes to overall quad mass and is trained proportionally by all squatting and pressing patterns.',
      exercises: ['Squat', 'Leg Press', 'Hack Squat', 'Leg Extension'],
    },
  ],
  hamstrings: [
    {
      name: 'Biceps Femoris', subtitle: 'Long & short head',
      badge: 'Primary Mover',
      recovery: '48–72 hrs',
      injury: 'Proximal hamstring tendinopathy from heavy hip hinge overload — build Romanian deadlift volume gradually and always stretch the hamstrings after sessions.',
      desc: 'The lateral hamstring muscle. The long head is bi-articular (crosses hip and knee) and is key for hip extension in deadlifts. Best trained with hip-hinge movements.',
      exercises: ['Romanian Deadlift', 'Deadlift', 'Lying Leg Curl', 'Nordic Curl'],
    },
    {
      name: 'Semimembranosus & Semitendinosus', subtitle: 'Medial hamstrings',
      badge: 'Mass Builder',
      recovery: '48–72 hrs',
      injury: 'Medial hamstring strain from sprinting or uncontrolled eccentric load — always warm up with leg swings and hamstring activation before any speed work.',
      desc: 'The two medial hamstring muscles that form the inner thigh. Also bi-articular. Best targeted with hip-hinge patterns and lying leg curls at full hip extension.',
      exercises: ['Romanian Deadlift', 'Lying Leg Curl', 'Good Morning', 'Nordic Curl'],
    },
  ],
  glutes: [
    {
      name: 'Gluteus Maximus', subtitle: 'Largest muscle in the body',
      badge: 'Power',
      recovery: '48–72 hrs',
      injury: 'Proximal hamstring/glute junction strain from deep hip thrusts with excessive weight — build load incrementally and maintain pelvic neutral throughout the movement.',
      desc: 'The primary hip extensor and the largest muscle in the human body. Responsible for explosive hip extension. Maximally activated when the hip is flexed — think deep squats and hip thrusts at full range.',
      exercises: ['Hip Thrust', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Glute Bridge', 'Step-Up'],
    },
    {
      name: 'Gluteus Medius', subtitle: 'Hip abductor',
      badge: 'Stability',
      recovery: '48–72 hrs',
      injury: 'Glute medius weakness causing hip drop and knee valgus during squats and running — prioritise single-leg stability work and lateral band exercises.',
      desc: 'Abducts and internally rotates the hip. Critical for single-leg stability and lateral movement. Weakness leads to knee valgus and hip drop in gait.',
      exercises: ['Lateral Band Walk', 'Cable Abduction', 'Single-Leg Squat', 'Clamshell'],
    },
    {
      name: 'Gluteus Minimus', subtitle: 'Deepest glute muscle',
      badge: 'Stabiliser',
      recovery: '48–72 hrs',
      injury: 'Deep hip pain from glute minimus overload in end-range abduction — train both abduction and internal rotation to balance demand across the hip.',
      desc: 'The smallest and deepest of the three glute muscles, lying directly beneath the medius. Assists in hip abduction and internal rotation and plays a key role in stabilising the pelvis during single-leg stance. Trained by the same movements as the medius but benefits most from full hip abduction with internal rotation.',
      exercises: ['Clamshell', 'Cable Abduction', 'Single-Leg Squat', 'Lateral Band Walk', 'Side-Lying Hip Abduction'],
    },
  ],
  adductors: [
    {
      name: 'Adductor Magnus', subtitle: 'Largest adductor',
      badge: 'Mass Builder',
      recovery: '48–72 hrs',
      injury: 'Groin strain at the adductor-hamstring junction from deep sumo deadlifts — warm up with adductor stretches and build load slowly through full inner-thigh range.',
      desc: 'The largest and most powerful adductor, with two distinct portions — an adductor part (femoral) and a hamstring part (tibial). The hamstring portion acts as an additional hip extensor and is heavily loaded in deep squats and Romanian deadlifts. Responsible for most of the inner-thigh mass.',
      exercises: ['Romanian Deadlift', 'Sumo Squat', 'Cable Adduction', 'Copenhagen Plank', 'Wide-Stance Leg Press'],
    },
    {
      name: 'Adductor Longus & Brevis', subtitle: 'Middle adductors',
      badge: 'Often Neglected',
      recovery: '48–72 hrs',
      injury: 'Groin strain — one of the most common athletic injuries — always perform dynamic groin stretches before lateral or change-of-direction movements.',
      desc: 'Located in the middle layer of the inner thigh. Primarily adduct the hip and assist in hip flexion. Often undertrained but highly susceptible to groin strains in athletes who neglect them. Best loaded in the lengthened position.',
      exercises: ['Cable Adduction', 'Machine Adduction', 'Sumo Squat', 'Copenhagen Plank'],
    },
    {
      name: 'Gracilis', subtitle: 'Long medial thigh muscle',
      badge: 'Stabiliser',
      recovery: '48–72 hrs',
      injury: 'Gracilis strain causing medial knee or inner thigh pain from explosive adduction — warm up thoroughly and avoid rapid changes in adductor training volume.',
      desc: 'A long, thin muscle running from the pubis to the medial tibia. The only adductor to cross both the hip and knee joints. Adducts the hip and assists knee flexion. Important for medial knee stability and often involved in groin strains.',
      exercises: ['Copenhagen Plank', 'Cable Adduction', 'Sumo Squat', 'Single-Leg Press'],
    },
    {
      name: 'Pectineus', subtitle: 'Upper inner thigh',
      badge: 'Stabiliser',
      recovery: '48–72 hrs',
      injury: 'Deep groin strain causing anterior hip pain — progress hip flexion and adduction load carefully and always address tightness before heavy lower-body sessions.',
      desc: 'A short, flat muscle at the top of the inner thigh connecting the pubis to the femur. Adducts and flexes the hip. Often the site of deep groin pain when strained. Best addressed with adductor stretching and controlled hip flexion under load.',
      exercises: ['Cable Adduction', 'Machine Adduction', 'Hip Flexion (cable)', 'Sumo Deadlift'],
    },
  ],
  hip_flexors: [
    {
      name: 'Iliopsoas', subtitle: 'Iliacus + Psoas Major',
      badge: 'Primary Mover',
      recovery: '24–48 hrs',
      injury: 'Hip flexor strain from explosive hip flexion or loading after prolonged sitting — stretch the iliopsoas after every session and avoid heavy cable hip flexion when tight.',
      desc: 'The most powerful hip flexor in the body, composed of two muscles that merge into one tendon. The psoas originates from the lumbar vertebrae; the iliacus from the inner pelvis. Together they flex the hip and externally rotate the femur. Chronically shortened in people who sit for long periods, leading to anterior pelvic tilt and lower-back pain.',
      exercises: ['Hanging Knee Raise', 'Cable Hip Flexion', 'Reverse Crunch', 'Dragon Flag', 'Hip Flexor Stretch'],
    },
    {
      name: 'Tensor Fasciae Latae', subtitle: 'TFL — IT band tensioner',
      badge: 'Stabiliser',
      recovery: '24–48 hrs',
      injury: 'IT band syndrome from TFL overactivity — stretch hip flexors after every run or squat session and foam roll the lateral thigh regularly.',
      desc: 'A short muscle at the top of the outer hip that feeds into the iliotibial (IT) band. Assists in hip flexion, abduction, and internal rotation, and stabilises the pelvis in single-leg stance. Commonly overactive and tight in runners, contributing to IT band syndrome and lateral knee pain.',
      exercises: ['Side-Lying Hip Abduction', 'Clamshell', 'Hip Hinge', 'TFL Stretch', 'Single-Leg Squat'],
    },
    {
      name: 'Rectus Femoris', subtitle: 'Quad head / hip flexor',
      badge: 'Multi-Function',
      recovery: '24–48 hrs',
      injury: 'Rectus femoris strain at the hip from sprinting or kicking — warm up with hip flexor mobilisation before any speed work and address anterior pelvic tilt.',
      desc: 'Though classified as a quad, the rectus femoris is the only quad head that crosses the hip joint, making it a secondary hip flexor. It is often the limiting factor in hip flexor tightness. Stretching it requires simultaneously extending the hip and flexing the knee.',
      exercises: ['Leg Extension', 'Bulgarian Split Squat', 'Couch Stretch', 'Reverse Nordic Curl'],
    },
  ],
  calves: [
    {
      name: 'Gastrocnemius', subtitle: 'Two-headed calf muscle',
      badge: 'Power',
      recovery: '24–48 hrs',
      injury: 'Gastrocnemius tear ("tennis leg") from sudden acceleration when cold — warm up thoroughly and never perform explosive calf loading without a progressive warm-up.',
      desc: 'The large, visible calf muscle with a medial and lateral head. Crosses both the knee and ankle joints. Best trained with straight-knee plantarflexion (standing calf raises).',
      exercises: ['Standing Calf Raise', 'Calf Press on Leg Press', 'Jump Rope'],
    },
    {
      name: 'Soleus', subtitle: 'Deep calf muscle',
      badge: 'Endurance',
      recovery: '24–48 hrs',
      injury: 'Soleus strain causing deep calf pain, often mistaken for DVT — use bent-knee calf raises to load it safely and never skip warm-up before running volume.',
      desc: 'A flat, wide muscle beneath the gastrocnemius. Does not cross the knee joint and is composed largely of slow-twitch fibres. Best trained with bent-knee calf raises under load.',
      exercises: ['Seated Calf Raise', 'Bent-Knee Calf Raise', 'Leg Press Calf Raise'],
    },
    {
      name: 'Tibialis Anterior', subtitle: 'Front of the shin',
      badge: 'Often Neglected',
      recovery: '24–48 hrs',
      injury: 'Shin splints from overuse running on hard surfaces — increase mileage or jump volume gradually and strengthen with tibialis raises to reduce impact load.',
      desc: 'Runs along the lateral surface of the tibia and dorsiflexes the ankle (pulls the foot up). The antagonist to the calf muscles. Critically important for ankle stability, running economy, and shin splint prevention. Virtually never trained in gym programs despite being stressed heavily in walking and running.',
      exercises: ['Tibialis Raise', 'Band Dorsiflexion', 'Reverse Calf Raise', 'Toe Walk'],
    },
    {
      name: 'Peroneals', subtitle: 'Fibularis Longus & Brevis',
      badge: 'Stability',
      recovery: '24–48 hrs',
      injury: 'Peroneal strain or snapping tendon from ankle instability — strengthen with eversion exercises after any ankle sprain to prevent re-injury.',
      desc: 'Run along the outer lower leg from the fibula to the foot. Evert the ankle (roll outward) and assist in plantarflexion. The primary restraints against ankle inversion sprains. Frequently weakened after ankle sprains, increasing re-injury risk if not rehabilitated.',
      exercises: ['Band Eversion', 'Single-Leg Balance', 'Lateral Step-Up', 'Bosu Squat', 'Ankle Circle'],
    },
  ],
}

const NUTRIENT_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'Protein': { bg: 'rgba(107,159,255,0.15)', color: '#6B9FFF', border: 'rgba(107,159,255,0.3)' },
  'Carbohydrates': { bg: 'rgba(255,160,80,0.15)', color: '#FFA050', border: 'rgba(255,160,80,0.3)' },
  'Fats': { bg: 'rgba(255,200,50,0.15)', color: '#FFC832', border: 'rgba(255,200,50,0.3)' },
  'Vitamin A': { bg: 'rgba(168,224,99,0.15)', color: '#A8E063', border: 'rgba(168,224,99,0.3)' },
  'Vitamin B complex': { bg: 'rgba(180,100,255,0.15)', color: '#B464FF', border: 'rgba(180,100,255,0.3)' },
  'Vitamin C': { bg: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: 'rgba(255,107,107,0.3)' },
  'Vitamin D': { bg: 'rgba(245,197,66,0.15)', color: '#F5C542', border: 'rgba(245,197,66,0.3)' },
  'Vitamin E': { bg: 'rgba(100,220,180,0.15)', color: '#64DCB4', border: 'rgba(100,220,180,0.3)' },
  'Vitamin K': { bg: 'rgba(78,205,196,0.15)', color: '#4ECDC4', border: 'rgba(78,205,196,0.3)' },
  'Calcium': { bg: 'rgba(100,180,255,0.15)', color: '#64B4FF', border: 'rgba(100,180,255,0.3)' },
  'Iron': { bg: 'rgba(224,112,80,0.15)', color: '#E07050', border: 'rgba(224,112,80,0.3)' },
  'Magnesium': { bg: 'rgba(67,201,160,0.15)', color: '#43C9A0', border: 'rgba(67,201,160,0.3)' },
  'Zinc': { bg: 'rgba(124,156,192,0.15)', color: '#7C9CC0', border: 'rgba(124,156,192,0.3)' },
  'Potassium': { bg: 'rgba(249,213,110,0.15)', color: '#F9D56E', border: 'rgba(249,213,110,0.3)' },
  'Water': { bg: 'rgba(139,180,232,0.15)', color: '#8BB4E8', border: 'rgba(139,180,232,0.3)' },
  'Electrolytes': { bg: 'rgba(0,212,255,0.15)', color: '#00D4FF', border: 'rgba(0,212,255,0.3)' },
}

const MUSCLE_NEEDS: Record<string, string[]> = {
  chest: ['Protein', 'Vitamin C', 'Zinc', 'Magnesium', 'Vitamin D'],
  shoulders: ['Protein', 'Vitamin C', 'Vitamin D', 'Zinc', 'Fats'],
  triceps: ['Protein', 'Carbohydrates', 'Magnesium', 'Vitamin B complex', 'Water'],
  back: ['Protein', 'Magnesium', 'Vitamin D', 'Potassium', 'Carbohydrates'],
  biceps: ['Protein', 'Carbohydrates', 'Magnesium', 'Vitamin B complex', 'Zinc'],
  forearms: ['Protein', 'Iron', 'Vitamin B complex', 'Electrolytes', 'Water'],
  neck: ['Protein', 'Calcium', 'Vitamin D', 'Magnesium', 'Vitamin C'],
  abs: ['Protein', 'Carbohydrates', 'Vitamin B complex', 'Magnesium', 'Water'],
  quads: ['Protein', 'Carbohydrates', 'Potassium', 'Magnesium', 'Electrolytes'],
  hamstrings: ['Protein', 'Potassium', 'Magnesium', 'Vitamin E', 'Electrolytes'],
  glutes: ['Protein', 'Carbohydrates', 'Vitamin D', 'Magnesium', 'Zinc'],
  adductors: ['Protein', 'Potassium', 'Magnesium', 'Vitamin E', 'Water'],
  hip_flexors: ['Protein', 'Vitamin B complex', 'Iron', 'Magnesium', 'Fats'],
  calves: ['Protein', 'Potassium', 'Magnesium', 'Iron', 'Electrolytes'],
}

const NUTRITION_DATA: Record<string, NutrientData[]> = {
  macros: [
    {
      id: 'protein', name: 'Protein', icon: 'bolt',
      summary: 'The primary building block for muscle repair and growth.',
      whyItMatters: 'Protein provides amino acids essential for muscle protein synthesis (MPS) after every training session. Each workout creates micro-tears in muscle fibres that require amino acids — particularly leucine — to repair and grow stronger. Without adequate protein, the training stimulus cannot translate into adaptation.',
      deficiency: 'Low protein → slow recovery, persistent soreness, and muscle loss despite consistent training.',
      timing: '20–40g within 2 hours post-training; spread total intake across 3–4 meals throughout the day.',
      supplement: 'Whey protein (fast-absorbing post-workout); casein (slow-release overnight recovery).',
      foods: ['Chicken breast', 'Eggs', 'Greek yogurt', 'Salmon', 'Tuna', 'Beef', 'Cottage cheese', 'Lentils', 'Tofu', 'Shrimp'],
      muscles: ['chest', 'back', 'quads', 'hamstrings', 'glutes'],
    },
    {
      id: 'carbohydrates', name: 'Carbohydrates', icon: 'bolt',
      summary: 'Primary fuel for high-intensity training and glycogen replenishment.',
      whyItMatters: 'Carbohydrates are stored as glycogen in muscles and liver — the near-exclusive fuel for heavy compound lifting. Depleted glycogen leads to early fatigue, reduced training output, and impaired recovery. Post-workout carbs also blunt cortisol and accelerate glycogen resynthesis when combined with protein.',
      deficiency: 'Low carbs → early fatigue, poor workout performance, and impaired recovery even with adequate protein.',
      timing: '1–2 hrs pre-training for sustained energy; combine with protein within 30–90 min post-training.',
      supplement: 'Creatine works synergistically with carbs — it enhances glycogen storage and ATP resynthesis.',
      foods: ['White rice', 'Oats', 'Sweet potato', 'Banana', 'Pasta', 'Quinoa', 'Dates', 'Bread', 'Corn', 'Fruit juice'],
      muscles: ['quads', 'back', 'triceps', 'abs', 'hamstrings'],
    },
    {
      id: 'fats', name: 'Fats', icon: 'drop',
      summary: 'Essential for hormone production, joint health, and fat-soluble vitamin absorption.',
      whyItMatters: 'Omega-3 fatty acids reduce exercise-induced inflammation and support joint and tendon recovery. Dietary fat is required to absorb vitamins A, D, E, and K — none are bioavailable without it. Healthy fats also support testosterone and other anabolic hormone production critical for long-term progress.',
      deficiency: 'Low fat → hormonal disruption, poor joint recovery, and blocked absorption of fat-soluble vitamins.',
      timing: 'Distribute throughout the day; avoid large fat intake immediately before training as it slows gastric emptying.',
      supplement: 'Omega-3 fish oil (1–3g EPA+DHA daily) reduces systemic inflammation and supports joint recovery.',
      foods: ['Avocado', 'Almonds', 'Salmon', 'Olive oil', 'Walnuts', 'Egg yolks', 'Macadamia nuts', 'Sardines', 'Flaxseed', 'Dark chocolate'],
      muscles: ['shoulders', 'hip_flexors'],
    },
  ],
  micros: [
    {
      id: 'vitamin-a', name: 'Vitamin A', icon: 'shield',
      summary: 'Supports muscle cell repair, immune function, and glycogen metabolism.',
      whyItMatters: 'Vitamin A plays a role in protein synthesis and the growth and repair of body tissues including muscle. It supports the immune system, which is temporarily suppressed after intense training. Both retinol and beta-carotene forms contribute to glycogen metabolism and cellular repair processes.',
      deficiency: 'Low vitamin A → impaired tissue repair, increased infection risk post-training, and poor recovery.',
      timing: 'With a fat-containing meal — vitamin A is fat-soluble and requires dietary fat for intestinal absorption.',
      foods: ['Beef liver', 'Sweet potato', 'Carrots', 'Kale', 'Spinach', 'Red bell pepper', 'Eggs', 'Butternut squash', 'Mango', 'Apricots'],
      muscles: ['back', 'glutes', 'quads'],
    },
    {
      id: 'vitamin-b', name: 'Vitamin B complex', icon: 'bolt',
      summary: 'Drives energy production, oxygen transport, and neuromuscular signalling.',
      whyItMatters: 'B vitamins are co-factors in nearly every energy-producing pathway. B6 supports amino acid metabolism; B12 and folate are critical for red blood cell production; B2 and B3 drive the electron transport chain in mitochondria. Athletes have higher B vitamin requirements due to elevated energy turnover.',
      deficiency: 'Low B vitamins → fatigue, poor endurance, brain fog during training, and slowed muscle repair.',
      timing: 'Throughout the day with meals; B12 is best absorbed in smaller, frequent doses rather than one large dose.',
      supplement: 'B12 supplementation is essential for vegans and vegetarians who avoid all animal products.',
      foods: ['Beef liver', 'Salmon', 'Chicken', 'Eggs', 'Whole grains', 'Sunflower seeds', 'Nutritional yeast', 'Milk', 'Lentils', 'Leafy greens'],
      muscles: ['triceps', 'biceps', 'forearms', 'abs', 'hip_flexors'],
    },
    {
      id: 'vitamin-c', name: 'Vitamin C', icon: 'shield',
      summary: 'Critical for collagen synthesis, tendon health, and reducing oxidative stress.',
      whyItMatters: 'Vitamin C is the primary co-factor for collagen formation — the structural protein in tendons, ligaments, and connective tissue. It also acts as a potent antioxidant, reducing post-exercise oxidative damage. Research shows 1g before exercise significantly accelerates tendon and ligament repair.',
      deficiency: 'Low vitamin C → poor tendon integrity, slow wound healing, and elevated connective tissue injury risk.',
      timing: '30–60 min before training to maximise collagen synthesis; pair with gelatin or collagen peptides for best effect.',
      supplement: '500–1000mg Vitamin C is inexpensive and widely used by injury-prone and high-volume athletes.',
      foods: ['Red bell pepper', 'Guava', 'Kiwi', 'Strawberries', 'Oranges', 'Broccoli', 'Papaya', 'Brussels sprouts', 'Kale', 'Lemon'],
      muscles: ['chest', 'shoulders', 'neck'],
    },
    {
      id: 'vitamin-d', name: 'Vitamin D', icon: 'bone',
      summary: 'Regulates muscle protein synthesis, fast-twitch fibre function, and calcium absorption.',
      whyItMatters: 'Vitamin D receptors (VDRs) are expressed in skeletal muscle cells. Deficiency specifically impairs Type II (fast-twitch) fibre performance, reducing power output and sprint capacity. It also regulates calcium and phosphorus balance — both critical for muscle contraction — and supports immune function suppressed by training.',
      deficiency: 'Low vitamin D → reduced muscle power, higher injury risk, impaired bone density, and immune dysfunction.',
      timing: 'With a fatty meal (fat-soluble); morning supplementation supports circadian regulation.',
      supplement: '1000–4000 IU Vitamin D3 daily is widely recommended, especially in winter or low-sunlight climates.',
      foods: ['Salmon', 'Herring', 'Sardines', 'Tuna', 'Cod liver oil', 'Egg yolks', 'UV-exposed mushrooms', 'Fortified milk', 'Fortified orange juice', 'Mackerel'],
      muscles: ['chest', 'shoulders', 'back', 'glutes', 'neck'],
    },
    {
      id: 'vitamin-e', name: 'Vitamin E', icon: 'shield',
      summary: 'Antioxidant that protects muscle membranes from exercise-induced oxidative damage.',
      whyItMatters: 'Intense eccentric exercise generates reactive oxygen species that damage muscle cell membranes. Vitamin E neutralises these free radicals, reducing DOMS and accelerating recovery. It is particularly important for injury-prone muscles under high eccentric load such as hamstrings and adductors.',
      deficiency: 'Low vitamin E → increased muscle cell membrane damage, higher DOMS, and slower eccentric recovery.',
      timing: 'With a fat-containing meal (fat-soluble); particularly beneficial post-workout on heavy eccentric training days.',
      foods: ['Sunflower seeds', 'Almonds', 'Avocado', 'Spinach', 'Olive oil', 'Peanut butter', 'Hazelnuts', 'Rainbow trout', 'Butternut squash', 'Pine nuts'],
      muscles: ['hamstrings', 'adductors'],
    },
    {
      id: 'vitamin-k', name: 'Vitamin K', icon: 'bone',
      summary: 'Essential for bone mineralisation and coagulation, supporting skeletal structure under load.',
      whyItMatters: 'Vitamin K2 activates osteocalcin, a protein that binds calcium into bone matrix — critical for bone density in heavy lifters. It supports the coagulation cascade ensuring normal healing from training micro-trauma. K2 works synergistically with Vitamin D3 to direct calcium into bone rather than soft tissue.',
      deficiency: 'Low vitamin K → impaired calcium deposition, reduced bone density, and delayed healing from micro-trauma.',
      timing: 'With a fat-containing meal; K2 (MK-7 form) pairs best with Vitamin D3 for synergistic bone health.',
      supplement: 'Vitamin K2 MK-7 is commonly combined with Vitamin D3 in bone health stacks.',
      foods: ['Kale', 'Spinach', 'Natto', 'Collard greens', 'Broccoli', 'Brussels sprouts', 'Parsley', 'Fermented cheese', 'Egg yolks', 'Soybean oil'],
      muscles: ['neck', 'calves'],
    },
    {
      id: 'calcium', name: 'Calcium', icon: 'bone',
      summary: 'Drives every muscle contraction, nerve signalling, and bone density under load.',
      whyItMatters: 'Calcium is released from the sarcoplasmic reticulum to trigger every muscle contraction — without it, the actin-myosin cross-bridge cycle cannot occur. It is also the primary mineral in bone, and heavy lifting creates compressive stress requiring adequate calcium to maintain density. Calcium and magnesium act as opposing regulators of muscle tension.',
      deficiency: 'Low calcium → muscle cramps and spasms, stress fracture risk, and impaired contraction force.',
      timing: 'Spread across the day — absorption is limited to ~500mg per sitting, so split doses are more effective.',
      supplement: 'Calcium citrate (better absorbed, any time) or carbonate (cheaper, with food); always pair with Vitamin D3.',
      foods: ['Milk', 'Greek yogurt', 'Cheese', 'Sardines (with bones)', 'Tofu', 'Kale', 'Almonds', 'Fortified plant milk', 'Broccoli', 'Bok choy'],
      muscles: ['neck', 'calves'],
    },
    {
      id: 'iron', name: 'Iron', icon: 'bolt',
      summary: 'Carries oxygen to working muscles and powers mitochondrial energy production.',
      whyItMatters: 'Iron is the central atom of haemoglobin and myoglobin, both of which deliver oxygen to contracting muscle tissue. It also drives the electron transport chain in mitochondria, enabling sustained aerobic energy production. Even mild iron deficiency without clinical anaemia significantly reduces VO2max and endurance capacity.',
      deficiency: 'Low iron → fatigue, reduced endurance, shortness of breath during training, and persistent brain fog.',
      timing: 'On an empty stomach for best absorption; avoid taking with calcium or high-calcium dairy which blocks uptake.',
      supplement: 'Iron bisglycinate is the most tolerable form — do not supplement without a blood test confirming deficiency.',
      foods: ['Beef liver', 'Oysters', 'Red meat', 'Spinach', 'Lentils', 'Pumpkin seeds', 'Tofu', 'Quinoa', 'Dark chocolate', 'Chickpeas'],
      muscles: ['forearms', 'hip_flexors', 'calves'],
    },
    {
      id: 'magnesium', name: 'Magnesium', icon: 'bolt',
      summary: 'Co-factor in 300+ reactions including ATP synthesis, protein synthesis, and muscle relaxation.',
      whyItMatters: 'Magnesium is the calcium antagonist — it relaxes muscle fibres after contraction and is essential for recovery. It is a required co-factor for ATP synthesis, meaning every contraction is indirectly magnesium-dependent. Sweat losses during training rapidly deplete magnesium, increasing cramp risk and impairing sleep quality.',
      deficiency: 'Low magnesium → muscle cramps, poor sleep, elevated stress response, and reduced training capacity.',
      timing: 'Before bed — magnesium supports sleep quality and overnight recovery; glycinate or threonate forms absorb best.',
      supplement: 'Magnesium glycinate (recovery and sleep) or malate (energy production) are most popular with athletes.',
      foods: ['Pumpkin seeds', 'Dark chocolate', 'Almonds', 'Spinach', 'Cashews', 'Black beans', 'Avocado', 'Brown rice', 'Salmon', 'Edamame'],
      muscles: ['chest', 'back', 'quads', 'hamstrings', 'calves'],
    },
    {
      id: 'zinc', name: 'Zinc', icon: 'shield',
      summary: 'Required for testosterone production, immune defence, and muscle protein synthesis.',
      whyItMatters: 'Zinc is a co-factor for over 300 enzymes and essential for testosterone biosynthesis. It directly activates the anabolic signalling pathways that build new muscle tissue. Heavy training increases zinc excretion through sweat, making athletes particularly vulnerable to deficiency over time.',
      deficiency: 'Low zinc → reduced testosterone, slower recovery, immune suppression, and impaired wound healing.',
      timing: 'With food to reduce nausea; avoid taking with iron or calcium simultaneously as they compete for absorption.',
      supplement: 'Zinc picolinate or glycinate are most bioavailable; ZMA (zinc + magnesium + B6) is popular pre-sleep.',
      foods: ['Oysters', 'Beef', 'Crab', 'Pumpkin seeds', 'Hemp seeds', 'Chickpeas', 'Lentils', 'Cashews', 'Dark chocolate', 'Eggs'],
      muscles: ['chest', 'shoulders', 'biceps', 'glutes'],
    },
    {
      id: 'potassium', name: 'Potassium', icon: 'bolt',
      summary: 'Regulates muscle membrane potential, preventing fatigue and cramping during exercise.',
      whyItMatters: 'Potassium maintains the resting membrane potential of muscle cells, enabling rapid, repeated contractions. During intense exercise, potassium shifts out of muscle cells, contributing to fatigue. Together with sodium, it governs the electrolyte balance that drives nerve impulse transmission to muscle fibres.',
      deficiency: 'Low potassium → muscle weakness, cramping, irregular heart rhythm, and rapid fatigue during training.',
      timing: 'Throughout the day in high-potassium foods (bananas, sweet potato, leafy greens) especially around training.',
      foods: ['Sweet potato', 'Banana', 'Avocado', 'Spinach', 'White potato', 'Coconut water', 'Dried apricots', 'Salmon', 'Kidney beans', 'Pomegranate'],
      muscles: ['back', 'quads', 'hamstrings', 'adductors', 'calves'],
    },
  ],
  hydration: [
    {
      id: 'water', name: 'Water', icon: 'drop',
      summary: 'Regulates every aspect of cellular function, performance, and recovery.',
      whyItMatters: 'Even 2% dehydration reduces strength output by up to 10% and aerobic capacity by up to 20%. Water is the medium for every enzymatic reaction, nutrient transport, and waste product removal in muscle tissue. Adequate hydration is also essential for joint lubrication and spinal disc health under compressive load.',
      deficiency: 'Dehydration → reduced strength, coordination, and endurance; increased injury risk and impaired recovery.',
      timing: 'Aim for 35–45ml per kg of bodyweight daily; consume 400–600ml in the 2 hours before training.',
      foods: ['Water', 'Watermelon', 'Cucumber', 'Strawberries', 'Lettuce', 'Celery', 'Zucchini', 'Oranges', 'Broth / soups', 'Coconut water'],
      muscles: ['triceps', 'forearms', 'abs', 'adductors'],
    },
    {
      id: 'electrolytes', name: 'Electrolytes', icon: 'bolt',
      summary: 'Sodium, potassium, and magnesium maintaining fluid balance and preventing cramping.',
      whyItMatters: 'Electrolytes govern fluid shifts between cells and surrounding tissue, maintaining the hydration state required for optimal contractions. Sodium retains fluid in the extracellular space; potassium drives it intracellularly. Sweating depletes all three, and failure to replace them accelerates performance decline and cramping.',
      deficiency: 'Low electrolytes → cramping, early fatigue, hyponatremia from drinking plain water without sodium replacement.',
      timing: 'During and after sessions lasting over 60 minutes; include sodium (>200mg per serving) especially in heat.',
      supplement: 'Electrolyte tablets or powder sachets — look for sodium, potassium, and magnesium together in each serving.',
      foods: ['Coconut water', 'Banana', 'Pickle juice', 'Watermelon', 'Avocado', 'Dairy (sodium)', 'Sea salt', 'Oranges', 'Pumpkin seeds', 'Sports drinks'],
      muscles: ['quads', 'hamstrings', 'calves', 'forearms'],
    },
  ],
  synergy: [
    {
      id: 'vit-d-calcium', name: 'Vitamin D + Calcium', icon: 'bone',
      summary: 'Vitamin D is the transport mechanism that makes calcium absorption possible.',
      whyItMatters: 'Without adequate Vitamin D, calcium cannot be absorbed from the gut regardless of intake. Vitamin D triggers production of calbindin, a protein that binds calcium in the intestinal wall and transfers it to the bloodstream. The two must be taken together for either to be effective for bone density and muscle contraction. Pairing K2 directs calcium into bone rather than arterial walls.',
      deficiency: 'Supplementing calcium without Vitamin D results in poor absorption and increased arterial calcification risk.',
      timing: 'Both are fat-soluble — take together with a fatty meal, ideally in the morning.',
      supplement: 'Vitamin D3 + K2 + Calcium combination supplements are the most practical approach for this trio.',
      foods: ['Salmon', 'Sardines (with bones)', 'Fortified milk', 'Greek yogurt', 'Cheese', 'Egg yolks', 'Fortified orange juice', 'Kale', 'Tofu', 'Mackerel'],
      muscles: ['neck', 'calves', 'back'],
    },
    {
      id: 'vit-c-iron', name: 'Vitamin C + Iron', icon: 'shield',
      summary: 'Vitamin C dramatically increases absorption of non-haem (plant-based) iron.',
      whyItMatters: 'Non-haem iron from plant sources is poorly absorbed on its own. Vitamin C reduces ferric iron to the more absorbable ferrous form and prevents insoluble iron complexes forming in the gut. Studies show vitamin C can increase non-haem iron absorption by up to 6-fold. Athletes on plant-based diets benefit most from always pairing these.',
      deficiency: 'Consuming iron-rich plant foods without vitamin C dramatically reduces the amount of iron actually absorbed.',
      timing: 'Consume together at the same meal — a glass of orange juice with iron-rich foods is the classic well-studied example.',
      foods: ['Spinach + lemon juice', 'Lentils + bell pepper', 'Beef + tomato', 'Orange juice + fortified cereal', 'Tofu + broccoli', 'Chickpeas + kiwi'],
      muscles: ['forearms', 'calves', 'hip_flexors'],
    },
    {
      id: 'protein-magnesium', name: 'Protein + Magnesium', icon: 'bolt',
      summary: 'Magnesium is required for the enzymes that actually incorporate amino acids into new muscle.',
      whyItMatters: 'Muscle protein synthesis is enzyme-driven, and many of those enzymes require magnesium as a co-factor. Without adequate magnesium, amino acids are absorbed but the molecular machinery to build them into new muscle is impaired. Magnesium also reduces cortisol, a catabolic hormone that directly breaks down muscle protein.',
      deficiency: 'High protein intake with low magnesium may blunt recovery due to impaired synthesis enzyme activity.',
      timing: 'Ensure magnesium intake is adequate throughout the day; magnesium before bed supports overnight protein synthesis.',
      foods: ['Pumpkin seeds', 'Black beans', 'Salmon + almonds', 'Chicken + spinach', 'Beef + cashews', 'Greek yogurt + dark chocolate', 'Lentils', 'Edamame'],
      muscles: ['chest', 'back', 'quads', 'hamstrings'],
    },
    {
      id: 'carbs-b-vitamins', name: 'Carbs + B vitamins', icon: 'bolt',
      summary: 'B vitamins are the metabolic keys that unlock carbohydrate energy.',
      whyItMatters: 'Carbohydrates cannot be converted to ATP without B vitamins as enzymatic co-factors. Thiamine (B1) initiates carbohydrate catabolism; riboflavin (B2) and niacin (B3) shuttle electrons through the electron transport chain; B6 enables glycogen breakdown during high-intensity work. A high-carb diet without adequate B vitamins creates energy bottlenecks despite sufficient fuel.',
      deficiency: 'High carb intake with low B vitamins leads to incomplete energy extraction and persistent fatigue despite eating enough.',
      timing: 'B vitamins are water-soluble and not stored — spread intake throughout the day especially around carb-rich meals.',
      foods: ['Brown rice', 'Whole wheat pasta', 'Oats', 'Lentils', 'Sunflower seeds', 'Fortified cereals', 'Sweet potato + eggs', 'Quinoa', 'Chickpeas'],
      muscles: ['triceps', 'biceps', 'abs', 'quads'],
    },
  ],
}

const BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'Primary Mover': { bg: 'rgba(200,245,90,0.15)', color: '#C8F55A', border: 'rgba(200,245,90,0.3)' },
  'Stabiliser': { bg: 'rgba(100,180,255,0.15)', color: '#64B4FF', border: 'rgba(100,180,255,0.3)' },
  'Mass Builder': { bg: 'rgba(255,160,80,0.15)', color: '#FFA050', border: 'rgba(255,160,80,0.3)' },
  'Often Neglected': { bg: 'rgba(255,90,90,0.15)', color: '#FF5A5A', border: 'rgba(255,90,90,0.3)' },
  'Multi-Function': { bg: 'rgba(180,100,255,0.15)', color: '#B464FF', border: 'rgba(180,100,255,0.3)' },
  'Posture': { bg: 'rgba(100,220,180,0.15)', color: '#64DCB4', border: 'rgba(100,220,180,0.3)' },
  'Foundation': { bg: 'rgba(255,200,50,0.15)', color: '#FFC832', border: 'rgba(255,200,50,0.3)' },
  'Thickness': { bg: 'rgba(200,245,90,0.15)', color: '#C8F55A', border: 'rgba(200,245,90,0.3)' },
  'Definition': { bg: 'rgba(100,180,255,0.15)', color: '#64B4FF', border: 'rgba(100,180,255,0.3)' },
  'Mass & Width': { bg: 'rgba(255,160,80,0.15)', color: '#FFA050', border: 'rgba(255,160,80,0.3)' },
  'Knee Health': { bg: 'rgba(100,220,180,0.15)', color: '#64DCB4', border: 'rgba(100,220,180,0.3)' },
  'Power': { bg: 'rgba(200,245,90,0.15)', color: '#C8F55A', border: 'rgba(200,245,90,0.3)' },
  'Stability': { bg: 'rgba(100,180,255,0.15)', color: '#64B4FF', border: 'rgba(100,180,255,0.3)' },
  'Endurance': { bg: 'rgba(180,100,255,0.15)', color: '#B464FF', border: 'rgba(180,100,255,0.3)' },
}

function MuscleCard({ muscle, needs, defaultOpen, onExerciseClick, onNutrientClick }: {
  muscle: MuscleData
  needs: string[]
  defaultOpen?: boolean
  onExerciseClick: (ex: string) => void
  onNutrientClick: (nutrient: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen || false)
  const bColor = BADGE_COLORS[muscle.badge] || BADGE_COLORS['Stabiliser']

  return (
    <div style={s.card}>
      <button style={s.cardHeader} onClick={() => setOpen(o => !o)}>
        <div style={s.cardHeaderLeft}>
          <span style={s.muscleName}>{muscle.name}</span>
          <span style={s.muscleSubtitle}>{muscle.subtitle}</span>
        </div>
        <div style={s.cardHeaderRight}>
          <span style={{ ...s.badge, background: bColor.bg, color: bColor.color, borderColor: bColor.border }}>
            {muscle.badge}
          </span>
          <span style={{ ...s.chevron, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </div>
      </button>
      {open && (
        <div style={s.cardBody}>
          {muscle.recovery && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
              <span style={{ color: 'var(--dim)' }}>Recovery: </span>{muscle.recovery}
            </div>
          )}
          {muscle.injury && (
            <div style={s.injuryCallout}>
              <span style={s.injuryIcon}>⚠</span>
              <span>{muscle.injury}</span>
            </div>
          )}
          <p style={s.muscleDesc}>{muscle.desc}</p>
          <div style={s.exerciseChips}>
            {muscle.exercises.map(ex => (
              <button
                key={ex}
                style={s.exChip}
                onClick={() => onExerciseClick(ex)}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                {ex}
              </button>
            ))}
          </div>
          {needs.length > 0 && (
            <div style={s.needsRow}>
              <span style={s.needsLabel}>Needs:</span>
              <div style={s.needsPills}>
                {needs.map(n => {
                  const c = NUTRIENT_COLORS[n] || NUTRIENT_COLORS['Protein']
                  return (
                    <button
                      key={n}
                      style={{ ...s.nutrientPill, background: c.bg, color: c.color, borderColor: c.border }}
                      onClick={() => onNutrientClick(n)}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type TabId = 'anatomy' | 'nutrition'
type NutritionMode = 'speed-read' | 'deep-dive'

const NUTRIENT_ID_MAP: Record<string, string> = {
  'Protein': 'protein', 'Carbohydrates': 'carbohydrates', 'Fats': 'fats',
  'Vitamin A': 'vitamin-a', 'Vitamin B complex': 'vitamin-b', 'Vitamin C': 'vitamin-c',
  'Vitamin D': 'vitamin-d', 'Vitamin E': 'vitamin-e', 'Vitamin K': 'vitamin-k',
  'Calcium': 'calcium', 'Iron': 'iron', 'Magnesium': 'magnesium',
  'Zinc': 'zinc', 'Potassium': 'potassium', 'Water': 'water', 'Electrolytes': 'electrolytes',
}

// Which NUTRITION_DATA section key contains each nutrient ID
const NUTRIENT_SECTION_MAP: Record<string, string> = {
  'protein': 'macros', 'carbohydrates': 'macros', 'fats': 'macros',
  'vitamin-a': 'micros', 'vitamin-b': 'micros', 'vitamin-c': 'micros',
  'vitamin-d': 'micros', 'vitamin-e': 'micros', 'vitamin-k': 'micros',
  'calcium': 'micros', 'iron': 'micros', 'magnesium': 'micros',
  'zinc': 'micros', 'potassium': 'micros',
  'water': 'hydration', 'electrolytes': 'hydration',
}

// Maps library muscle IDs → our activePart group keys
const MUSCLE_TO_GROUP: Record<string, string> = {
  'neck-right': 'neck', 'neck-left': 'neck', 'nape': 'neck',
  'shoulder-front-left': 'shoulders', 'shoulder-side-left': 'shoulders',
  'shoulder-front-right': 'shoulders', 'shoulder-side-right': 'shoulders',
  'deltoid-rear-left': 'shoulders', 'deltoid-rear-right': 'shoulders',
  'chest-upper-left': 'chest', 'chest-lower-left': 'chest',
  'chest-upper-right': 'chest', 'chest-lower-right': 'chest',
  'biceps-left': 'biceps', 'biceps-right': 'biceps',
  'forearm-left': 'forearms', 'forearm-right': 'forearms',
  'forearm-flexors-left': 'forearms', 'forearm-extensors-left': 'forearms',
  'forearm-flexors-right': 'forearms', 'forearm-extensors-right': 'forearms',
  'triceps-long-left': 'triceps', 'triceps-lateral-left': 'triceps',
  'triceps-long-right': 'triceps', 'triceps-lateral-right': 'triceps',
  'traps-upper-left': 'back', 'traps-mid-left': 'back', 'traps-lower-left': 'back',
  'traps-upper-right': 'back', 'traps-mid-right': 'back', 'traps-lower-right': 'back',
  'lats-upper-left': 'back', 'lats-mid-left': 'back', 'lats-lower-left': 'back',
  'lats-upper-right': 'back', 'lats-mid-right': 'back', 'lats-lower-right': 'back',
  'spine': 'back', 'lower-back-erectors-left': 'back', 'lower-back-ql-left': 'back',
  'lower-back-erectors-right': 'back', 'lower-back-ql-right': 'back',
  'abs-upper-left': 'abs', 'abs-upper-right': 'abs',
  'abs-lower-left': 'abs', 'abs-lower-right': 'abs',
  'serratus-anterior-left': 'abs', 'serratus-anterior-right': 'abs',
  'obliques-left': 'abs', 'obliques-right': 'abs',
  'hip-flexor-left': 'hip_flexors', 'hip-flexor-right': 'hip_flexors',
  'quads-left': 'quads', 'quads-right': 'quads',
  'adductors-left': 'adductors', 'adductors-right': 'adductors',
  'gluteus-maximus-left': 'glutes', 'gluteus-medius-left': 'glutes',
  'gluteus-maximus-right': 'glutes', 'gluteus-medius-right': 'glutes',
  'hamstrings-medial-left': 'hamstrings', 'hamstrings-lateral-left': 'hamstrings',
  'hamstrings-medial-right': 'hamstrings', 'hamstrings-lateral-right': 'hamstrings',
  'tibialis-anterior-left': 'calves', 'tibialis-anterior-right': 'calves',
  'calves-gastroc-medial-left': 'calves', 'calves-gastroc-lateral-left': 'calves',
  'calves-soleus-left': 'calves', 'calves-gastroc-medial-right': 'calves',
  'calves-gastroc-lateral-right': 'calves', 'calves-soleus-right': 'calves',
}

// Maps our group keys → library muscle IDs for each view
const FRONT_MUSCLES_FOR: Record<string, string[]> = {
  neck: ['neck-right', 'neck-left'],
  shoulders: ['shoulder-front-left', 'shoulder-side-left', 'shoulder-front-right', 'shoulder-side-right'],
  chest: ['chest-upper-left', 'chest-lower-left', 'chest-upper-right', 'chest-lower-right'],
  biceps: ['biceps-left', 'biceps-right'],
  forearms: ['forearm-left', 'forearm-right'],
  abs: ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right', 'serratus-anterior-left', 'serratus-anterior-right', 'obliques-left', 'obliques-right'],
  hip_flexors: ['hip-flexor-left', 'hip-flexor-right'],
  quads: ['quads-left', 'quads-right'],
  adductors: ['adductors-left', 'adductors-right'],
  calves: ['tibialis-anterior-left', 'tibialis-anterior-right'],
}

const BACK_MUSCLES_FOR: Record<string, string[]> = {
  neck: ['nape'],
  shoulders: ['deltoid-rear-left', 'deltoid-rear-right'],
  back: ['traps-upper-left', 'traps-mid-left', 'traps-lower-left', 'traps-upper-right', 'traps-mid-right', 'traps-lower-right', 'lats-upper-left', 'lats-mid-left', 'lats-lower-left', 'lats-upper-right', 'lats-mid-right', 'lats-lower-right', 'spine', 'lower-back-erectors-left', 'lower-back-ql-left', 'lower-back-erectors-right', 'lower-back-ql-right'],
  triceps: ['triceps-long-left', 'triceps-lateral-left', 'triceps-long-right', 'triceps-lateral-right'],
  forearms: ['forearm-flexors-left', 'forearm-extensors-left', 'forearm-flexors-right', 'forearm-extensors-right'],
  glutes: ['gluteus-maximus-left', 'gluteus-medius-left', 'gluteus-maximus-right', 'gluteus-medius-right'],
  hamstrings: ['hamstrings-medial-left', 'hamstrings-lateral-left', 'hamstrings-medial-right', 'hamstrings-lateral-right'],
  calves: ['calves-gastroc-medial-left', 'calves-gastroc-lateral-left', 'calves-soleus-left', 'calves-gastroc-medial-right', 'calves-gastroc-lateral-right', 'calves-soleus-right'],
}

function buildBodyState(groupKey: string, muscleMap: Record<string, string[]>): BodyState {
  const state: BodyState = {}
  const ids = muscleMap[groupKey] || []
  for (const id of ids) state[id] = { intensity: 6, selected: true }
  return state
}

const sbm: Record<string, React.CSSProperties> = {
  container: {
    borderBottom: '1px solid var(--border)',
    background: 'transparent',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 8px 4px',
  },
  row: {
    display: 'flex', flexDirection: 'row', gap: '0px',
    width: '100%', maxWidth: '340px',
  },
  chartWrap: { flex: 1, minHeight: '200px' },
  hint: { fontSize: '10px', color: 'var(--dim)', marginTop: '3px', letterSpacing: '0.04em' },
}

function BodyMap({ activePart, onPartSelect }: {
  activePart: string
  onPartSelect: (part: string) => void
}) {
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const frontChart = useRef<BodyChart | null>(null)
  const backChart = useRef<BodyChart | null>(null)

  const handleClick = (id: string) => {
    const group = MUSCLE_TO_GROUP[id]
    if (group) onPartSelect(group)
  }

  useEffect(() => {
    if (!frontRef.current || !backRef.current) return

    frontChart.current = new BodyChart(frontRef.current, {
      view: ViewSide.FRONT,
      bodyState: buildBodyState(activePart, FRONT_MUSCLES_FOR),
      onMuscleClick: handleClick,
    })
    backChart.current = new BodyChart(backRef.current, {
      view: ViewSide.BACK,
      bodyState: buildBodyState(activePart, BACK_MUSCLES_FOR),
      onMuscleClick: handleClick,
    })

    return () => {
      frontChart.current?.destroy()
      backChart.current?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    frontChart.current?.update({ bodyState: buildBodyState(activePart, FRONT_MUSCLES_FOR) })
    backChart.current?.update({ bodyState: buildBodyState(activePart, BACK_MUSCLES_FOR) })
  }, [activePart])

  return (
    <div style={sbm.container}>
      <div style={sbm.row}>
        <div ref={frontRef} style={sbm.chartWrap} />
        <div ref={backRef} style={sbm.chartWrap} />
      </div>
      <span style={sbm.hint}>Tap a muscle to explore it</span>
    </div>
  )
}

function NutrientIcon({ type }: { type: NutrientData['icon'] }) {
  const col = 'currentColor'
  if (type === 'bolt') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z" stroke={col} strokeWidth="1.8" strokeLinejoin="round" fill={col} fillOpacity="0.15" />
    </svg>
  )
  if (type === 'shield') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z" stroke={col} strokeWidth="1.8" strokeLinejoin="round" fill={col} fillOpacity="0.15" />
    </svg>
  )
  if (type === 'bone') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="2.5" stroke={col} strokeWidth="1.8" />
      <circle cx="19" cy="5" r="2.5" stroke={col} strokeWidth="1.8" />
      <circle cx="5" cy="19" r="2.5" stroke={col} strokeWidth="1.8" />
      <circle cx="19" cy="19" r="2.5" stroke={col} strokeWidth="1.8" />
      <line x1="7" y1="7" x2="17" y2="17" stroke={col} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="17" y1="7" x2="7" y2="17" stroke={col} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2C12 2 5 9 5 14C5 17.9 8.1 21 12 21C15.9 21 19 17.9 19 14C19 9 12 2 12 2Z" stroke={col} strokeWidth="1.8" strokeLinejoin="round" fill={col} fillOpacity="0.15" />
    </svg>
  )
}

function NutrientCard({ nutrient, mode, highlighted, onMuscleClick }: {
  nutrient: NutrientData
  mode: NutritionMode
  highlighted?: boolean
  onMuscleClick: (groupKey: string) => void
}) {
  const nc = NUTRIENT_COLORS[nutrient.name] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: 'var(--border)' }

  return (
    <div
      id={`nutrient-${nutrient.id}`}
      style={{
        ...sn.nutCard,
        borderColor: highlighted ? nc.color : nc.border,
        boxShadow: highlighted ? `0 0 0 2px ${nc.color}44` : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {/* Header — always visible */}
      <div style={sn.nutCardHeader}>
        <div style={{ ...sn.nutIconWrap, background: nc.bg, color: nc.color, borderColor: nc.border }}>
          <NutrientIcon type={nutrient.icon} />
        </div>
        <div style={sn.nutCardTitles}>
          <span style={sn.nutName}>{nutrient.name}</span>
          <span style={sn.nutSummary}>{nutrient.summary}</span>
        </div>
      </div>

      {/* Deep-dive body */}
      {mode === 'deep-dive' && (
        <div style={sn.nutCardBody}>
          <div style={sn.trainingCallout}>
            <span style={sn.calloutLabel}>⚡ Training</span>
            <p style={sn.calloutText}>{nutrient.whyItMatters}</p>
          </div>

          <div style={sn.defCallout}>
            <span style={sn.calloutLabel}>⚠ Deficiency</span>
            <p style={sn.calloutText}>{nutrient.deficiency}</p>
          </div>

          <div style={sn.timingCallout}>
            <span style={sn.calloutLabel}>⏱ Timing</span>
            <p style={sn.calloutText}>{nutrient.timing}</p>
          </div>

          {nutrient.supplement && (
            <div style={sn.suppCallout}>
              <span style={sn.calloutLabel}>⬡ Supplement</span>
              <p style={sn.calloutText}>{nutrient.supplement}</p>
            </div>
          )}

          {nutrient.foods.length > 0 && (
            <div style={{ ...sn.suppCallout, background: 'rgba(100,220,180,0.06)', borderColor: 'rgba(100,220,180,0.2)' }}>
              <span style={{ ...sn.calloutLabel, color: '#64DCB4' }}>🥗 Best food sources</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                {nutrient.foods.map(food => (
                  <span
                    key={food}
                    style={{
                      fontSize: '11px', padding: '3px 9px',
                      background: 'rgba(100,220,180,0.1)', border: '1px solid rgba(100,220,180,0.25)',
                      borderRadius: '20px', color: '#64DCB4',
                    }}
                  >
                    {food}
                  </span>
                ))}
              </div>
            </div>
          )}

          {nutrient.muscles.length > 0 && (
            <div style={sn.musclesRow}>
              <span style={sn.musclesLabel}>Muscles:</span>
              <div style={sn.musclesPills}>
                {nutrient.muscles.map(key => (
                  <button
                    key={key}
                    style={sn.musclePill}
                    onClick={() => onMuscleClick(key)}
                  >
                    {PART_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CollapsibleSection({ title, children, open, onToggle, accentColor }: {
  title: string
  children: React.ReactNode
  open: boolean
  onToggle: () => void
  accentColor?: string
}) {
  return (
    <div style={{ ...sn.section, borderColor: open && accentColor ? `${accentColor}33` : 'var(--border)' }}>
      <button style={sn.sectionHeader} onClick={onToggle}>
        {accentColor && <span style={{ ...sn.sectionAccentBar, background: accentColor }} />}
        <span style={sn.sectionTitle}>{title}</span>
        <span style={{ ...sn.sectionChevron, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: accentColor || 'var(--dim)' }}>▾</span>
      </button>
      {open && <div style={sn.sectionBody}>{children}</div>}
    </div>
  )
}

export default function BodyLabPage() {
  const [tab, setTab] = useState<TabId>('anatomy')
  const [search, setSearch] = useState('')
  const [activePart, setActivePart] = useState('chest')
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [nutritionMode, setNutritionMode] = useState<NutritionMode>('speed-read')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    macros: true, micros: false, hydration: false, synergy: false,
  })
  const [highlightedNutrient, setHighlightedNutrient] = useState<string | null>(null)
  const pendingScrollRef = React.useRef<string | null>(null)
  const anatomyContentRef = React.useRef<HTMLElement | null>(null)
  const isMobile = useIsMobile()

  const allParts = GROUPS[0].parts
  const allMuscles = DATA[activePart] || []
  const q = search.trim().toLowerCase()

  // Per-group filtering (used when not in global search mode)
  const muscles = q
    ? allMuscles.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.subtitle.toLowerCase().includes(q) ||
      m.desc.toLowerCase().includes(q) ||
      m.exercises.some(ex => ex.toLowerCase().includes(q))
    )
    : allMuscles

  // Global search across all anatomy groups
  type AnatomyResult = {
    kind: 'muscle' | 'group'
    groupKey: string
    groupLabel: string
    muscle?: MuscleData
    matchedNeeds?: string[]
  }

  const anatomyResults: AnatomyResult[] = q ? (() => {
    // Direct text matches on individual muscles
    const muscleMatches: AnatomyResult[] = allParts.flatMap(groupKey =>
      (DATA[groupKey] || [])
        .filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.subtitle.toLowerCase().includes(q) ||
          m.desc.toLowerCase().includes(q) ||
          m.exercises.some(ex => ex.toLowerCase().includes(q))
        )
        .map(m => ({ kind: 'muscle' as const, groupKey, groupLabel: PART_LABELS[groupKey], muscle: m }))
    )
    // Groups matched via MUSCLE_NEEDS (e.g. searching "magnesium")
    const coveredGroups = new Set(muscleMatches.map(r => r.groupKey))
    const groupMatches: AnatomyResult[] = allParts.flatMap(groupKey => {
      if (coveredGroups.has(groupKey)) return []
      const matchedNeeds = (MUSCLE_NEEDS[groupKey] || []).filter(n => n.toLowerCase().includes(q))
      return matchedNeeds.length > 0
        ? [{ kind: 'group' as const, groupKey, groupLabel: PART_LABELS[groupKey], matchedNeeds }]
        : []
    })
    return [...muscleMatches, ...groupMatches]
  })() : []

  // Global search across all nutrition cards
  const allNutrients = [
    ...NUTRITION_DATA.macros,
    ...NUTRITION_DATA.micros,
    ...NUTRITION_DATA.hydration,
    ...NUTRITION_DATA.synergy,
  ]
  const nutritionResults = q
    ? allNutrients.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.summary.toLowerCase().includes(q) ||
      n.whyItMatters.toLowerCase().includes(q) ||
      n.deficiency.toLowerCase().includes(q) ||
      n.timing.toLowerCase().includes(q) ||
      (n.supplement || '').toLowerCase().includes(q) ||
      n.muscles.some(mk => (PART_LABELS[mk] || '').toLowerCase().includes(q))
    )
    : []

  const hasResults = anatomyResults.length > 0 || nutritionResults.length > 0
  const isSearching = q.length > 0

  // Contextual headings
  const matchedNutrientName = q.length >= 2
    ? Object.keys(NUTRIENT_COLORS).find(n => n.toLowerCase().includes(q))
    : null
  const matchedPartKey = q.length >= 2
    ? allParts.find(key => PART_LABELS[key].toLowerCase().includes(q))
    : null
  const matchedPartLabel = matchedPartKey ? PART_LABELS[matchedPartKey] : null

  const anatomyHeading = matchedNutrientName
    ? `Muscles that need ${matchedNutrientName}`
    : `Anatomy`
  const nutritionHeading = matchedPartLabel
    ? `Nutrients that benefit ${matchedPartLabel}`
    : `Nutrition`

  // After switching to nutrition tab, scroll to pending nutrient
  React.useEffect(() => {
    if (tab === 'nutrition' && pendingScrollRef.current) {
      const id = pendingScrollRef.current
      pendingScrollRef.current = null
      setTimeout(() => {
        const el = document.getElementById(`nutrient-${id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setHighlightedNutrient(id)
          setTimeout(() => setHighlightedNutrient(null), 1800)
        }
      }, 60)
    }
  }, [tab])

  function switchTab(t: TabId) {
    setTab(t)
    setSearch('')
  }

  function handleNutrientClick(nutrientName: string) {
    const id = NUTRIENT_ID_MAP[nutrientName] || nutrientName.toLowerCase().replace(/\s+/g, '-')
    const section = NUTRIENT_SECTION_MAP[id]
    if (section) {
      setOpenSections(prev => ({ ...prev, [section]: true }))
    }
    pendingScrollRef.current = id
    setTab('nutrition')
    setSearch('')
  }

  function handleMuscleClick(groupKey: string) {
    setActivePart(groupKey)
    setTab('anatomy')
    setSearch('')
  }

  function toggleSection(id: string) {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleBodyMapSelect(part: string) {
    setActivePart(part)
    requestAnimationFrame(() => {
      if (anatomyContentRef.current) anatomyContentRef.current.scrollTop = 0
    })
  }

  return (
    <div style={{
      ...s.page,
      ...(isMobile ? { overflowY: 'auto', height: 'auto', minHeight: '100dvh' } : {}),
    }}>
      {selectedExercise && (
        <ExerciseModal
          exerciseName={selectedExercise}
          onClose={() => setSelectedExercise(null)}
        />
      )}

      {/* Top bar: search + tab toggle */}
      <div style={{ ...s.topBar, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : '14px' }}>
        <div style={s.searchWrap}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Search muscles, nutrients, exercises…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.searchInput}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          {search && (
            <button style={s.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div style={s.tabToggle}>
          <button
            style={{ ...s.tabBtn, ...(tab === 'anatomy' ? s.tabBtnActive : {}) }}
            onClick={() => switchTab('anatomy')}
          >
            Anatomy
          </button>
          <button
            style={{ ...s.tabBtn, ...(tab === 'nutrition' ? s.tabBtnActive : {}) }}
            onClick={() => switchTab('nutrition')}
          >
            Nutrition
          </button>
        </div>
      </div>

      {/* ── Unified search results ── */}
      {isSearching && (
        <div style={s.searchResults}>
          {!hasResults && (
            <p style={s.searchEmpty}>No results for "{search}".</p>
          )}

          {anatomyResults.length > 0 && (
            <div style={s.searchGroup}>
              <span style={s.searchGroupLabel}>{anatomyHeading} · {anatomyResults.length} result{anatomyResults.length !== 1 ? 's' : ''}</span>
              {anatomyResults.map(r => (
                <button
                  key={r.kind === 'muscle' ? `${r.groupKey}-${r.muscle!.name}` : r.groupKey}
                  style={s.searchResultCard}
                  onClick={() => { setActivePart(r.groupKey); setTab('anatomy'); setSearch('') }}
                >
                  <div style={s.searchResultTop}>
                    <span style={s.searchResultName}>
                      {r.kind === 'muscle' ? r.muscle!.name : r.groupLabel}
                    </span>
                    <span style={s.searchResultTab}>Anatomy</span>
                  </div>
                  <span style={s.searchResultSub}>
                    {r.kind === 'muscle'
                      ? `${r.groupLabel} · ${r.muscle!.subtitle}`
                      : `Needs: ${r.matchedNeeds!.join(', ')}`
                    }
                  </span>
                </button>
              ))}
            </div>
          )}

          {nutritionResults.length > 0 && (
            <div style={s.searchGroup}>
              <span style={s.searchGroupLabel}>{nutritionHeading} · {nutritionResults.length} result{nutritionResults.length !== 1 ? 's' : ''}</span>
              {nutritionResults.map(r => (
                <button
                  key={r.id}
                  style={s.searchResultCard}
                  onClick={() => {
                    const section = NUTRIENT_SECTION_MAP[r.id] || 'macros'
                    setOpenSections(prev => ({ ...prev, [section]: true }))
                    pendingScrollRef.current = r.id
                    setTab('nutrition')
                    setSearch('')
                  }}
                >
                  <div style={s.searchResultTop}>
                    <span style={s.searchResultName}>{r.name}</span>
                    <span style={{ ...s.searchResultTab, background: 'rgba(78,205,196,0.15)', color: '#4ECDC4' }}>Nutrition</span>
                  </div>
                  <span style={s.searchResultSub}>{r.summary}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Anatomy tab */}
      {!isSearching && tab === 'anatomy' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: isMobile ? 'visible' : 'hidden' }}>
          <BodyMap activePart={activePart} onPartSelect={handleBodyMapSelect} />
          <div style={{ ...s.layout, flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'visible' : 'hidden' }}>
            {isMobile ? (
              <div style={s.mobileTabStrip}>
                {allParts.map(part => (
                  <button
                    key={part}
                    style={{ ...s.mobileTab, ...(activePart === part ? s.mobileTabActive : {}) }}
                    onClick={() => setActivePart(part)}
                  >
                    {PART_LABELS[part]}
                  </button>
                ))}
              </div>
            ) : (
              <aside style={s.sidebar}>
                {GROUPS.map((group, index) => (
                  <div key={`group-${index}`} style={s.group}>
                    {group.parts.map(part => (
                      <button
                        key={part}
                        style={{ ...s.sideTab, ...(activePart === part ? s.sideTabActive : {}) }}
                        onClick={() => setActivePart(part)}
                      >
                        {PART_LABELS[part]}
                      </button>
                    ))}
                  </div>
                ))}
              </aside>
            )}

            <main ref={anatomyContentRef as React.RefObject<HTMLElement>} style={{ ...s.content, padding: isMobile ? '16px' : '24px 28px', overflowY: isMobile ? 'visible' : 'auto' }}>
              <div style={s.contentHeader}>
                <h1 style={{ ...s.pageTitle, fontSize: isMobile ? '24px' : '28px' }}>
                  {PART_LABELS[activePart]}
                </h1>
                <span style={s.muscleCount}>
                  {q ? `${muscles.length} of ${allMuscles.length}` : `${muscles.length}`} muscle{muscles.length !== 1 ? 's' : ''}
                </span>
              </div>
              {muscles.length === 0 && q ? (
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No muscles match "{search}".</p>
              ) : (
                <div style={s.cards}>
                  {muscles.map((muscle, i) => (
                    <MuscleCard
                      key={muscle.name}
                      muscle={muscle}
                      needs={MUSCLE_NEEDS[activePart] || []}
                      defaultOpen={i === 0 && !q}
                      onExerciseClick={setSelectedExercise}
                      onNutrientClick={handleNutrientClick}
                    />
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* Nutrition tab */}
      {!isSearching && tab === 'nutrition' && (
        <div style={sn.nutTab}>
          {/* Speed-read / Deep-dive toggle */}
          <div style={{ ...sn.modeBar, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <span style={sn.modeLabel}>View mode</span>
            <div style={sn.modeToggle}>
              <button
                style={{ ...sn.modeBtn, ...(nutritionMode === 'speed-read' ? sn.modeBtnActive : {}) }}
                onClick={() => setNutritionMode('speed-read')}
              >
                ⚡ Speed-read
              </button>
              <button
                style={{ ...sn.modeBtn, ...(nutritionMode === 'deep-dive' ? sn.modeBtnActive : {}) }}
                onClick={() => setNutritionMode('deep-dive')}
              >
                🔬 Deep-dive
              </button>
            </div>
          </div>

          {/* Sections */}
          <div style={sn.sections}>
            <CollapsibleSection title="Macronutrients" open={openSections.macros} onToggle={() => toggleSection('macros')} accentColor="#4ECDC4">
              {NUTRITION_DATA.macros.map(n => (
                <NutrientCard key={n.id} nutrient={n} mode={nutritionMode} highlighted={highlightedNutrient === n.id} onMuscleClick={handleMuscleClick} />
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Micronutrients" open={openSections.micros} onToggle={() => toggleSection('micros')} accentColor="#4ECDC4">
              {NUTRITION_DATA.micros.map(n => (
                <NutrientCard key={n.id} nutrient={n} mode={nutritionMode} highlighted={highlightedNutrient === n.id} onMuscleClick={handleMuscleClick} />
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Hydration" open={openSections.hydration} onToggle={() => toggleSection('hydration')} accentColor="#4ECDC4">
              {NUTRITION_DATA.hydration.map(n => (
                <NutrientCard key={n.id} nutrient={n} mode={nutritionMode} highlighted={highlightedNutrient === n.id} onMuscleClick={handleMuscleClick} />
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="How They Work Together" open={openSections.synergy} onToggle={() => toggleSection('synergy')} accentColor="#4ECDC4">
              {NUTRITION_DATA.synergy.map(n => (
                <NutrientCard key={n.id} nutrient={n} mode={nutritionMode} highlighted={highlightedNutrient === n.id} onMuscleClick={handleMuscleClick} />
              ))}
            </CollapsibleSection>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },

  // Top bar
  topBar: {
    display: 'flex', alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
    gap: '14px',
  },
  searchWrap: {
    flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '0 10px',
    transition: 'border-color 0.15s',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: '13px', padding: '8px 0',
    fontFamily: 'DM Sans, sans-serif',
  },
  searchClear: {
    background: 'none', border: 'none', color: 'var(--dim)',
    cursor: 'pointer', fontSize: '11px', padding: '0 2px',
  },

  // Tab toggle
  tabToggle: {
    display: 'flex', gap: '4px', flexShrink: 0,
    background: 'var(--surface2)', borderRadius: '8px', padding: '3px',
    border: '1px solid var(--border)',
  },
  tabBtn: {
    padding: '6px 16px', borderRadius: '6px', border: 'none',
    background: 'none', color: 'var(--muted)',
    fontSize: '13px', fontWeight: '500', cursor: 'pointer',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  tabBtnActive: {
    background: 'var(--accent)', color: '#0a0a0a',
  },

  // Anatomy layout
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  mobileTabStrip: {
    display: 'flex', flexDirection: 'row',
    overflowX: 'auto', flexShrink: 0,
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    padding: '10px 12px', gap: '6px',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
  },
  mobileTab: {
    flexShrink: 0, padding: '6px 14px',
    borderRadius: '20px', border: '1px solid var(--border)',
    background: 'none', color: 'var(--muted)',
    fontSize: '12px', cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'all 0.15s',
  },
  mobileTabActive: {
    background: 'var(--accent-dim)', borderColor: 'rgba(200,245,90,0.4)',
    color: 'var(--accent)',
  },
  sidebar: {
    width: '160px', flexShrink: 0,
    borderRight: '1px solid var(--border)',
    overflowY: 'auto', padding: '16px 0',
    background: 'var(--surface)',
  },
  group: { marginBottom: '16px' },
  sideTab: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '7px 14px', background: 'none', border: 'none',
    borderLeftWidth: '2px', borderLeftStyle: 'solid', borderLeftColor: 'transparent',
    color: 'var(--muted)', fontSize: '13px', cursor: 'pointer',
    transition: 'all 0.15s',
  },
  sideTabActive: {
    color: 'var(--accent)', background: 'var(--accent-dim)',
    borderLeftColor: 'var(--accent)',
  },
  content: { flex: 1, overflowY: 'auto', padding: '24px 28px' },
  contentHeader: {
    display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px',
  },
  pageTitle: {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px',
    color: 'var(--text)', letterSpacing: '0.05em', margin: 0,
  },
  muscleCount: { fontSize: '12px', color: 'var(--dim)' },
  cards: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', overflow: 'hidden',
  },
  cardHeader: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '12px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left',
  },
  cardHeaderLeft: { display: 'flex', flexDirection: 'column', gap: '2px' },
  cardHeaderRight: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  muscleName: { fontSize: '14px', fontWeight: '600', color: 'var(--text)' },
  muscleSubtitle: { fontSize: '11px', color: 'var(--dim)' },
  badge: {
    fontSize: '10px', fontWeight: '600', padding: '2px 8px',
    borderRadius: '20px', border: '1px solid', whiteSpace: 'nowrap',
  },
  chevron: {
    color: 'var(--dim)', fontSize: '14px',
    transition: 'transform 0.2s', userSelect: 'none',
  },
  cardBody: {
    padding: '0 14px 14px', borderTop: '1px solid var(--border)',
    paddingTop: '12px',
  },
  injuryCallout: {
    display: 'flex', alignItems: 'flex-start', gap: '7px',
    background: 'rgba(255,160,50,0.07)', border: '1px solid rgba(255,160,50,0.2)',
    borderRadius: '6px', padding: '7px 10px', marginBottom: '10px',
    fontSize: '11px', color: 'rgba(255,180,80,0.9)', lineHeight: '1.5',
  },
  injuryIcon: {
    fontSize: '11px', flexShrink: 0, marginTop: '1px', opacity: 0.8,
  },
  muscleDesc: {
    fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7',
    margin: '0 0 10px',
  },
  exerciseChips: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  exChip: {
    fontSize: '11px', padding: '4px 10px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '20px', color: 'var(--muted)', cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },

  // Search results
  searchResults: {
    flex: 1, overflowY: 'auto', padding: '16px',
    display: 'flex', flexDirection: 'column', gap: '20px',
  },
  searchEmpty: {
    fontSize: '13px', color: 'var(--muted)', textAlign: 'center', marginTop: '32px',
  },
  searchGroup: {
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  searchGroupLabel: {
    fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--dim)',
    paddingBottom: '4px',
  },
  searchResultCard: {
    display: 'flex', flexDirection: 'column', gap: '4px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '12px 14px',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'border-color 0.15s',
    minHeight: '56px',
  },
  searchResultTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
  },
  searchResultName: {
    fontSize: '13px', fontWeight: '600', color: 'var(--text)',
  },
  searchResultTab: {
    fontSize: '9px', fontWeight: '700', letterSpacing: '0.06em',
    textTransform: 'uppercase', padding: '2px 7px', borderRadius: '20px',
    background: 'rgba(255,107,107,0.15)', color: '#FF6B6B',
    flexShrink: 0,
  },
  searchResultSub: {
    fontSize: '11px', color: 'var(--muted)', lineHeight: '1.4',
  },

  needsRow: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    marginTop: '12px', paddingTop: '10px',
    borderTop: '1px solid var(--border)',
  },
  needsLabel: {
    fontSize: '10px', color: 'var(--dim)', fontWeight: '600',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    paddingTop: '3px', flexShrink: 0,
  },
  needsPills: { display: 'flex', flexWrap: 'wrap', gap: '5px' },
  nutrientPill: {
    fontSize: '10px', fontWeight: '500', padding: '2px 8px',
    borderRadius: '20px', border: '1px solid', cursor: 'pointer',
    transition: 'opacity 0.15s', whiteSpace: 'nowrap',
    background: 'none',
  },

}

const sn: Record<string, React.CSSProperties> = {
  nutTab: {
    flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
  },

  // Speed-read / Deep-dive toggle bar
  modeBar: {
    display: 'flex', gap: '10px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  modeLabel: {
    fontSize: '11px', color: 'var(--dim)', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    paddingTop: '2px',
  },
  modeToggle: {
    display: 'flex', gap: '4px',
    background: 'var(--surface2)', borderRadius: '8px', padding: '3px',
    border: '1px solid var(--border)',
  },
  modeBtn: {
    padding: '7px 14px', borderRadius: '6px', border: 'none',
    background: 'none', color: 'var(--muted)',
    fontSize: '12px', fontWeight: '500', cursor: 'pointer',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
    minHeight: '36px',
  },
  modeBtnActive: {
    background: '#26A69A', color: '#fff',
  },

  // Sections
  sections: {
    display: 'flex', flexDirection: 'column', gap: '0px',
    padding: '16px',
    paddingBottom: '40px',
  },
  section: {
    border: '1px solid var(--border)', borderRadius: '10px',
    overflow: 'hidden', marginBottom: '10px',
    background: 'var(--surface)',
    transition: 'border-color 0.2s',
  },
  sectionHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
    padding: '14px 16px', background: 'none', border: 'none',
    cursor: 'pointer', textAlign: 'left',
    minHeight: '48px',
  },
  sectionAccentBar: {
    width: '3px', height: '16px', borderRadius: '2px', flexShrink: 0,
  },
  sectionTitle: {
    flex: 1, fontSize: '14px', fontWeight: '600', color: 'var(--text)',
    fontFamily: 'DM Sans, sans-serif',
  },
  sectionChevron: {
    fontSize: '16px', transition: 'transform 0.2s',
    userSelect: 'none', flexShrink: 0,
  },
  sectionBody: {
    borderTop: '1px solid var(--border)',
    padding: '12px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },

  placeholder: {
    fontSize: '12px', color: 'var(--dim)',
    padding: '8px 4px', margin: 0,
  },

  // Nutrient card
  nutCard: {
    background: 'var(--surface2)', border: '1px solid',
    borderRadius: '8px', overflow: 'hidden',
  },
  nutCardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    padding: '12px 14px',
  },
  nutIconWrap: {
    width: '28px', height: '28px', borderRadius: '6px',
    border: '1px solid', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0,
  },
  nutCardTitles: {
    display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0,
  },
  nutName: {
    fontSize: '13px', fontWeight: '600', color: 'var(--text)',
  },
  nutSummary: {
    fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5',
  },
  nutCardBody: {
    borderTop: '1px solid var(--border)',
    padding: '10px 14px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },

  // Callout blocks
  trainingCallout: {
    background: 'rgba(78,205,196,0.07)', border: '1px solid rgba(78,205,196,0.2)',
    borderRadius: '6px', padding: '8px 10px',
  },
  defCallout: {
    background: 'rgba(255,160,50,0.07)', border: '1px solid rgba(255,160,50,0.2)',
    borderRadius: '6px', padding: '8px 10px',
  },
  timingCallout: {
    background: 'rgba(180,100,255,0.07)', border: '1px solid rgba(180,100,255,0.2)',
    borderRadius: '6px', padding: '8px 10px',
  },
  suppCallout: {
    background: 'rgba(100,220,130,0.07)', border: '1px solid rgba(100,220,130,0.2)',
    borderRadius: '6px', padding: '8px 10px',
  },
  calloutLabel: {
    display: 'block', fontSize: '9px', fontWeight: '700',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--dim)', marginBottom: '4px',
  },
  calloutText: {
    fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6', margin: 0,
  },

  // Muscles row on nutrient card
  musclesRow: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    paddingTop: '6px', borderTop: '1px solid var(--border)',
  },
  musclesLabel: {
    fontSize: '10px', color: 'var(--dim)', fontWeight: '600',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    paddingTop: '3px', flexShrink: 0,
  },
  musclesPills: { display: 'flex', flexWrap: 'wrap', gap: '5px' },
  musclePill: {
    fontSize: '10px', fontWeight: '500', padding: '2px 8px',
    borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--muted)',
    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: 'var(--dim)' }}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
