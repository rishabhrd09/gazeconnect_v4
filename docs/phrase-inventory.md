# English screen phrase inventory

Source snapshot: `c19bada` on branch `featuring/ui-design-windows-production-refinement`. Extracted 14 September 2026. No application behavior changed.

This inventory covers shipped communication words, phrase cards and activity requests, including single-word choices. It uses the actual initialized CustomizationService data after migrations, then applies each screen’s visibility limits. It does not enumerate navigation labels, settings descriptions, survey answers, generated map feedback or online article text; those are application content, not communication presets. Saved customization.json profiles and session history can change the lists on an individual device.

**Counts below include repeated occurrences on different screens.** Exact spelling and capitalization are preserved; activity labels and spoken text are distinguished.

| Screen | Displayed entries |
| --- | --- |
| Quick Phrases / Quick Words | 79 |
| Assistance / Daily Care | 35 |
| Phrases | 18 |
| Feelings | 20 |
| Basic Needs | 24 |
| Activities | 20 |
| Home | 4 |
| People | 6 |
| Alert Mode | 6 |

Total: **212 displayed entries; 185 distinct displayed texts** (case-sensitive).

## Displayed communication content

### Quick Phrases / Quick Words

#### Medical / Urgent

- TT Suction
- Oral Suction
- Breathing / Ambu
- BP / Pulse
- Chest / Nebulization
- Severe Pain

#### Medical / Urgent → TT Suction

- Do TT suction
- Remove secretions from suction side
- Check the trach tube
- I am feeling some obstruction

#### Medical / Urgent → Oral Suction

- Do oral suction
- There is saliva in my mouth
- Do oral care and clean my teeth
- I am choking on secretions

#### Medical / Urgent → Breathing / Ambu

- I am having trouble breathing
- Use the Ambu bag
- Check oxygen support
- Check TT cuff pressure

#### Medical / Urgent → BP / Pulse

- Check my BP
- Check my pulse
- I feel dizzy
- I feel weak

#### Medical / Urgent → Chest / Nebulization

- I have chest discomfort
- My chest feels tight / chest congestion
- Give nebulization

#### Medical / Urgent → Severe Pain

- Back pain / headache
- Throat pain
- Pain in hands and legs
- Stomach pain

#### Position

- Turn Left
- Turn Right
- Head Up
- Head Down
- Fix Pillow
- Adjust Hands & Legs

#### Position → Head Up

- Raise bed angle
- Raise the backrest
- Shift me up
- Adjust bed angle to sitting position

#### Position → Head Down

- Lower bed angle
- Lower the backrest
- Shift me up
- Adjust bed angle to sitting position

#### Position → Fix Pillow

- Fix my pillow
- Move the pillow higher
- Move the pillow lower
- Support my neck better

#### Position → Adjust Hands & Legs

- Adjust my hands
- Adjust my legs
- My arm is uncomfortable
- My leg needs support

#### Daily Care

- Water
- Eyes / Face
- Blanket
- Fan
- Urine Pot / Toilet
- AC
- Food / Diet

#### Daily Care → Eyes / Face

- Put eye drops
- My eyes are dry
- Clean my eyes
- Clean my face

#### Daily Care → Blanket

- Cover me
- I feel cold
- Use a light blanket
- Remove the blanket

#### Daily Care → Fan

- Turn the fan on
- Turn the fan off
- Increase the fan
- Reduce the fan

#### Daily Care → Urine Pot / Toilet

- I need the urine pot now
- Remove the urine pot

#### Daily Care → AC

- Turn on the AC
- Turn off the AC
- Increase AC cooling
- Reduce AC cooling

#### Daily Care → Food / Diet

- I want food
- I am hungry
- I need my diet

### Assistance / Daily Care

#### AIRWAY & VITALS

- TT Suction needed now
- Oral suction needed
- Breathing problem - Ambu bag
- Breathing discomfort
- Check vitals - O2, Pulse
- Ventilator alarm - check
- Check TT cuff / balloon pressure
- Call nurse immediately

#### BED & POSITION

- Turn to Left Side
- Turn to Right Side
- Raise my head
- Lower my head
- Fix Pillow
- Adjust Head / Neck
- Adjust Hands & Legs
- Back care needed

#### DAILY CARE

- I want food
- I am hungry
- I need my diet
- I need Water
- Oral Care / Clean Teeth
- Clean Face / Eyes
- Eye Drops
- Toilet / Urine Pot
- Fan
- Blanket / Shawl
- AC

#### SYMPTOMS

- I am in severe pain
- Chest discomfort
- Fever
- Feeling cold / shivering
- Feeling hot / sweating
- Panic / Anxiety
- Itching
- Too tired / need rest

### Phrases

#### Communication

- Yes
- No
- Wait a moment
- Let me think
- I don't understand
- Repeat that
- Ask yes or no
- Speak slowly
- Thank you

#### Feelings & Emotions

- I am okay
- I am scared
- I am anxious
- I feel uncomfortable
- I am tired
- I feel lonely
- I am grateful
- I love you
- I miss you

### Feelings

These screen components are routed in App.tsx, even though they are not separate tiles on the current Home screen.

#### Feelings

- I am happy
- I am sad
- I am tired
- I am in pain
- I feel uncomfortable
- I am feeling better
- I am anxious
- I am frustrated
- I am bored
- I am grateful
- I am cold
- I am hot
- I am hungry
- I am thirsty
- I need rest
- I am okay
- I love you
- I miss you
- I am scared
- I feel lonely

### Basic Needs

These screen components are routed in App.tsx, even though they are not separate tiles on the current Home screen.

#### Basic Needs

- I need water
- I need food
- I need bathroom
- Urine pot
- Remove urine pot
- I am cold
- I am hot
- Need blanket
- Adjust pillow
- Change position
- Adjust bed up
- Adjust bed down
- Adjust fan speed
- Adjust AC
- Close window
- Lip balm
- Eye drops
- Head massage
- Clean face
- Shawl please
- Scratch my nose
- Wipe my face
- Mosquito
- Itching

### Activities

#### TV Channels

| Displayed text | Spoken text |
| --- | --- |
| Switch ON TV | Switch on TV |
| Switch OFF TV | Switch off TV |
| News - 508 | Change to channel 508 |
| News - 511 | Change to channel 511 |
| News - 521 | Change to channel 521 |
| News - 524 | Change to channel 524 |
| Movies - 310 | Change to channel 310 |
| Tarak Mehta | Change to channel 132 |

#### YouTube

| Displayed text | Spoken text |
| --- | --- |
| Play old songs | Play old songs |
| Play comedy videos | Play comedy videos |
| Play devotional music | Play devotional music |
| Play news clips | Play news clips |
| Pause video | Pause video |
| Volume down | Volume down |

#### Alexa

| Displayed text | Spoken text |
| --- | --- |
| Om chanting | Alexa play Om chanting |
| Hanuman Chalisa | Alexa play Hanuman Chalisa |
| Kishore Kumar songs | Alexa play Kishore Kumar songs |
| Bhajan playlist | Alexa play bhajan playlist |
| Stop music | Alexa stop music |
| Set volume low | Alexa set volume low |

### Home

#### Care cards

- TT Suction
- Ambu Bag
- Oral Suction
- Breathing Discomfort

### People

#### Contacts

- Rishabh
- Bhawana
- Parakh
- Caretaker
- Nurse
- Doctor

### Alert Mode

#### Dedicated board

| Displayed text | Spoken text |
| --- | --- |
| SOS Emergency | Emergency please come immediately |
| TT Suction | TT Suction |
| Oral Suction | Oral Suction |
| Position Change | Position Change |
| Pain | Pain |
| Ambu Bag | Ambu Bag |

## Configured phrases that the current screens do not show

These are present in the active default data but are not reachable through their normal phrase/card lists. A matching phrase can still appear elsewhere or through keyboard prediction.

| Screen | Group | Text | Reason |
| --- | --- | --- | --- |
| Quick Phrases / Quick Words | Medical / Urgent → Oral Suction | Come quickly | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Medical / Urgent → Breathing / Ambu | Call nurse now | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Medical / Urgent → BP / Pulse | Check the monitor | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Position → Fix Pillow | That is better | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Position → Adjust Hands & Legs | That is better now | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Daily Care → Eyes / Face | My eyes are irritated | Configured but hidden: picker limit is 4 |
| Quick Phrases / Quick Words | Daily Care → Blanket | Adjust the blanket | Configured but hidden: picker limit is 4 |
| Phrases | Communication | Sorry | Configured but hidden: category limit is 9 |
| Phrases | Feelings & Emotions | Pray for me | Configured but hidden: category limit is 9 |
| Phrases | People & Visitors | Call family | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Call nurse | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Call doctor | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Call caretaker | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Who is there? | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Who is at the door? | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | I want to video call | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | I don't want visitors | Configured but hidden: category excluded from Phrases screen |
| Phrases | People & Visitors | Ask them to wait | Configured but hidden: category excluded from Phrases screen |
| Activities | TV Channels | Ramayan | Configured but hidden: activity limit is 8 |
| People | Stored phrases for Rishabh | Call Rishabh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Rishabh | Rishabh come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Rishabh | Talk to Rishabh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Rishabh | Where is Rishabh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Rishabh | Rishabh thank you | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Bhawana | Call Bhawana | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Bhawana | Bhawana come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Bhawana | Talk to Bhawana | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Bhawana | Where is Bhawana | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Bhawana | Bhawana thank you | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Parakh | Call Parakh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Parakh | Parakh come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Parakh | Talk to Parakh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Parakh | Where is Parakh | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Parakh | Parakh thank you | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Caretaker | Call Caretaker | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Caretaker | Caretaker come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Caretaker | Talk to Caretaker | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Caretaker | Where is Caretaker | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Caretaker | Caretaker thank you | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Nurse | Call Nurse | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Nurse | Nurse come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Nurse | Talk to Nurse | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Nurse | Where is Nurse | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Nurse | Nurse thank you | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Doctor | Call Doctor | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Doctor | Doctor come here | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Doctor | Talk to Doctor | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Doctor | Where is Doctor | Configured but hidden: People screen speaks name only |
| People | Stored phrases for Doctor | Doctor thank you | Configured but hidden: People screen speaks name only |

## Other retained, unused phrase data

The following lists are not active screen content. They are included to avoid confusing stored data with what users can select. Older overridden arrays in defaultCustomization.ts and the unreferenced defaultPhrases.json are also not the authoritative board content.

### Quick Words coreWords

| Text | Spoken text | Status |
| --- | --- | --- |
| Yes | Yes | Unused: QuickWordsGrid accepts but does not render coreWords |
| No | No | Unused: QuickWordsGrid accepts but does not render coreWords |
| Wait | Wait | Unused: QuickWordsGrid accepts but does not render coreWords |
| Stop | Stop | Unused: QuickWordsGrid accepts but does not render coreWords |
| Help | Help | Unused: QuickWordsGrid accepts but does not render coreWords |
| Pain | Pain | Unused: QuickWordsGrid accepts but does not render coreWords |

### AAC / FAMILY & PEOPLE

| Text | Spoken text | Status |
| --- | --- | --- |
| Rishabh | Rishabh | Unused: no active AAC board renderer |
| Mummy | Mummy | Unused: no active AAC board renderer |
| Nurse | Nurse | Unused: no active AAC board renderer |
| Doctor | Doctor | Unused: no active AAC board renderer |
| Caretaker | Caretaker | Unused: no active AAC board renderer |

### AAC / EMERGENCY

| Text | Spoken text | Status |
| --- | --- | --- |
| Help | Help | Unused: no active AAC board renderer |
| Pain | Pain | Unused: no active AAC board renderer |
| Suction | Suction | Unused: no active AAC board renderer |
| Medicine | Medicine | Unused: no active AAC board renderer |
| Breathing Problem | Breathing Problem | Unused: no active AAC board renderer |
| Emergency | Emergency | Unused: no active AAC board renderer |

### AAC / BASIC NEEDS

| Text | Spoken text | Status |
| --- | --- | --- |
| Water | Water | Unused: no active AAC board renderer |
| Bathroom | Bathroom | Unused: no active AAC board renderer |
| Position | Position | Unused: no active AAC board renderer |
| Hot | Hot | Unused: no active AAC board renderer |
| Cold | Cold | Unused: no active AAC board renderer |
| Diet/Food | Diet/Food | Unused: no active AAC board renderer |

### AAC / RESPONSES

| Text | Spoken text | Status |
| --- | --- | --- |
| Yes | Yes | Unused: no active AAC board renderer |
| No | No | Unused: no active AAC board renderer |
| Maybe | Maybe | Unused: no active AAC board renderer |
| OK | OK | Unused: no active AAC board renderer |
| Wait | Wait | Unused: no active AAC board renderer |

### AAC / COURTESY

| Text | Spoken text | Status |
| --- | --- | --- |
| Please | Please | Unused: no active AAC board renderer |
| Thank you | Thank you | Unused: no active AAC board renderer |
| Sorry | Sorry | Unused: no active AAC board renderer |
| Excuse me | Excuse me | Unused: no active AAC board renderer |

### AAC / FEELINGS

| Text | Spoken text | Status |
| --- | --- | --- |
| Happy | Happy | Unused: no active AAC board renderer |
| Sad | Sad | Unused: no active AAC board renderer |
| Tired | Tired | Unused: no active AAC board renderer |
| Uncomfortable | Uncomfortable | Unused: no active AAC board renderer |
| Scared | Scared | Unused: no active AAC board renderer |
| Lonely | Lonely | Unused: no active AAC board renderer |

### AAC / ACTIONS

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn on TV | Turn on TV | Unused: no active AAC board renderer |
| Adjust Bed | Adjust Bed | Unused: no active AAC board renderer |
| Fan Speed | Fan Speed | Unused: no active AAC board renderer |
| AC Temperature | AC Temperature | Unused: no active AAC board renderer |
| Light On/Off | Light On/Off | Unused: no active AAC board renderer |

### AAC / ACTIVITIES

| Text | Spoken text | Status |
| --- | --- | --- |
| TV | TV | Unused: no active AAC board renderer |
| Music | Music | Unused: no active AAC board renderer |
| Now | Now | Unused: no active AAC board renderer |
| Later | Later | Unused: no active AAC board renderer |

### STANDARD_QUICKFIRES

| Text | Spoken text | Status |
| --- | --- | --- |
| Yes | Yes | Unused: QuickFires has no imports |
| No | No | Unused: QuickFires has no imports |
| Wait | Please wait | Unused: QuickFires has no imports |
| Help | I need help | Unused: QuickFires has no imports |
| More | Tell me more | Unused: QuickFires has no imports |
| Done | I am done | Unused: QuickFires has no imports |
| Thanks | Thank you | Unused: QuickFires has no imports |
| OK | OK | Unused: QuickFires has no imports |
| Repeat | Repeat that | Unused: QuickFires has no imports |
| Stop | Stop | Unused: QuickFires has no imports |
| Pain | I have pain | Unused: QuickFires has no imports |
| Water | I want water | Unused: QuickFires has no imports |

### MEDICAL_QUICKFIRES

| Text | Spoken text | Status |
| --- | --- | --- |
| Pain | I have pain | Unused: QuickFires has no imports |
| Suction | I need suction | Unused: QuickFires has no imports |
| Position | Change my position | Unused: QuickFires has no imports |
| Water | I want water | Unused: QuickFires has no imports |
| Toilet | I need to use the toilet | Unused: QuickFires has no imports |
| Medicine | I need my medicine | Unused: QuickFires has no imports |
| Cold | I am feeling cold | Unused: QuickFires has no imports |
| Hot | I am feeling hot | Unused: QuickFires has no imports |
| Breathing | Breathing problem | Unused: QuickFires has no imports |
| Help | I need help | Unused: QuickFires has no imports |

### Old keyboard picker / fan

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn on the fan | Turn on the fan | Unreachable: quickWordsOpen is never set true |
| Turn off the fan | Turn off the fan | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / ac

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn on the AC | Turn on the AC | Unreachable: quickWordsOpen is never set true |
| Turn off the AC | Turn off the AC | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / adjust fan / ac

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn on the fan | Turn on the fan | Unreachable: quickWordsOpen is never set true |
| Turn off the fan | Turn off the fan | Unreachable: quickWordsOpen is never set true |
| Turn on the AC | Turn on the AC | Unreachable: quickWordsOpen is never set true |
| Turn off the AC | Turn off the AC | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / tv

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn on the TV | Turn on the TV | Unreachable: quickWordsOpen is never set true |
| Turn off the TV | Turn off the TV | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / water

| Text | Spoken text | Status |
| --- | --- | --- |
| I want warm water | I want warm water | Unreachable: quickWordsOpen is never set true |
| I want cold water | I want cold water | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / pain

| Text | Spoken text | Status |
| --- | --- | --- |
| I am in pain | I am in pain | Unreachable: quickWordsOpen is never set true |
| Give me pain medicine | Give me pain medicine | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / medicine

| Text | Spoken text | Status |
| --- | --- | --- |
| Give me medicine | Give me medicine | Unreachable: quickWordsOpen is never set true |
| Medicine time now | Medicine time now | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / tt suction

| Text | Spoken text | Status |
| --- | --- | --- |
| TT suction needed now | TT suction needed now | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / oral suction

| Text | Spoken text | Status |
| --- | --- | --- |
| Oral suction needed | Oral suction needed | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / ambu bag

| Text | Spoken text | Status |
| --- | --- | --- |
| Start ambu please | Start ambu please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / breathing discomfort

| Text | Spoken text | Status |
| --- | --- | --- |
| I am having trouble breathing | I am having trouble breathing | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / severe pain

| Text | Spoken text | Status |
| --- | --- | --- |
| I am in severe pain | I am in severe pain | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / help now

| Text | Spoken text | Status |
| --- | --- | --- |
| Help me please come fast | Help me please come fast | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / turn left

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn me to left side | Turn me to left side | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / turn right

| Text | Spoken text | Status |
| --- | --- | --- |
| Turn me to right side | Turn me to right side | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / head up

| Text | Spoken text | Status |
| --- | --- | --- |
| Raise my head please | Raise my head please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / head down

| Text | Spoken text | Status |
| --- | --- | --- |
| Lower my head please | Lower my head please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / adjust pillows

| Text | Spoken text | Status |
| --- | --- | --- |
| Adjust my pillow please | Adjust my pillow please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / adjust neck support

| Text | Spoken text | Status |
| --- | --- | --- |
| Adjust my neck support please | Adjust my neck support please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / blanket / shawl

| Text | Spoken text | Status |
| --- | --- | --- |
| Give me blanket please | Give me blanket please | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / fever

| Text | Spoken text | Status |
| --- | --- | --- |
| I am having fever | I am having fever | Unreachable: quickWordsOpen is never set true |

### Old keyboard picker / check o₂

| Text | Spoken text | Status |
| --- | --- | --- |
| Check oxygen level | Check oxygen level | Unreachable: quickWordsOpen is never set true |

## Sources and display rules

- `src/services/CustomizationService.ts`: initializes/migrates care content and applies saved customizations.
- `src/services/careContentPresets.ts`: authoritative care, communication and activity presets.
- `src/services/defaultCustomization.ts`: Home, Feelings, Basic Needs, People and Alert Mode defaults.
- `src/components/QuickWordPhraseOverlay.tsx`: first four phrases only; related cards reuse the same content.
- `src/components/shared/QuickWordsGrid.tsx`: first eight enabled cards per category; coreWords is not rendered.
- `src/screens/PhrasesScreen.tsx`: Communication and Feelings categories only; first nine entries; Recent reuses session selections.
- `src/screens/ActivitiesScreen.tsx`: first three categories and first eight items per category.
- `src/screens/PeopleScreen.tsx`: speaks selected contact name; stored person phrases are not rendered.
- `src/screens/MedicalScreen.tsx`: Daily Care items are paged, so all current defaults are reachable.

See [keyboard phrase inventory](keyboard-phrase-inventory.md) for the separate typing suggestion sources, and [CSV inventory](phrase-inventory.csv) for sortable screen data.
