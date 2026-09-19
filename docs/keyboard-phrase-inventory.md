# Keyboard phrase suggestion inventory

Source snapshot: `c19bada`; extracted 14 September 2026. This is a source-code inventory, not a list of phrases invented for this report.

The keyboard has several distinct sources: empty-message starters, full-sentence templates, abbreviation expansions, learned patient sentences and optional neural continuations. Consequently, the complete set of possible runtime suggestions is not finite. The fixed English banks are listed completely below.

- Sentence templates: **333 unique English phrases** (338 occurrences across prefix groups).
- **332** of those phrases meet the traditional keyboard’s six-word/42-character phrase-button limit; **1** does not.
- Built-in English abbreviation mappings: **120**.

## When the suggestions appear

- With empty text, the backend returns starters in the word prediction stream. History-derived stems and the current topic can precede general defaults.
- While typing, the backend selects up to three sentence results using prefix/keyword matches, learned history, time-of-day/topic ranking and potentially a neural continuation.
- Traditional Keyboard displays at most two qualifying sentence buttons, only when its navigation is hidden. It filters out sentences longer than six words or 42 characters. Those limits apply to this lower sentence row, not to abbreviation expansions returned in the word stream.
- Zone Board displays six entries from the word prediction stream and local fallbacks. It does not receive the separate sentencePredictions prop. It can show starters and abbreviation expansions via word predictions, but not the traditional keyboard’s sentence row.
- Stored screen phrases do not automatically become this sentence bank. Spoken/learned text can add personal entries later.

## Empty-message starter phrases

### General defaults

- I need
- Please
- Can you
- I am
- Help
- Thank you

### Topic: basic

- I need
- I want
- Water
- Please
- Can you

### Topic: medical

- I need
- Pain
- Medicine
- Help
- Please

### Topic: comfort

- Please
- Turn me
- Adjust
- I am
- Can you

### Topic: family

- Please call
- How is
- I miss
- Thank you
- Good morning

### Topic: emotion

- I am
- I feel
- Please
- Thank you
- I miss

### Topic: greet

- Good morning
- Hello
- Thank you
- Good night
- Please

### Topic: emergency

- Help
- I need
- Please
- Call doctor
- Breathing

### Frontend fallbacks

Traditional Keyboard fallback bank: I need, Please, Can you, I am, Help. The top row currently displays four entries.

Zone Board local fallback words: help, water, please, hungry, yes, no, food, want, need, hello, home, rest, thanks, family. Six are selected at a time; these are words, not a separate sentence bank.

## Complete fixed English sentence bank

Each heading is the configured matching prefix. A phrase need not begin with that prefix: keyword matching can also return it. “Too long for lower row” means present in the backend bank but excluded by the frontend phrase-button length rule. Repeated phrases are retained under their source groups.

### Prefix: i want

- I want warm water
- I want cold water
- I want to change position
- I want medicine
- I want to rest
- I want to eat
- I want to go to toilet
- I want black tea
- I want to sleep
- I want to sit up
- I want milk
- I want my phone

### Prefix: i need

- I need water
- I need suction
- I need help
- I need medicine
- I need to change position
- I need rest
- I need bathroom
- I need blanket

### Prefix: i am

- I am in pain
- I am feeling better
- I am uncomfortable
- I am cold
- I am hot
- I am tired
- I am thirsty
- I am hungry
- I am fine
- I am having trouble breathing
- I am worried
- I am happy today
- I am feeling weak

### Prefix: please

- Please do suction
- Please change my position
- Please call the doctor
- Please give me medicine
- Please turn on the fan
- Please close the door
- Please turn off the light
- Please give me water
- Please check my BP
- Please adjust pillow
- Please come here
- Please help me
- Please wait

### Prefix: can you

- Can you adjust my pillow
- Can you check my BP
- Can you call someone
- Can you turn me
- Can you give me water
- Can you bring my phone

### Prefix: can i

- Can I have water
- Can I get medicine
- Can I rest now
- Can I talk to mummy
- Can I see my phone
- Can I go to toilet
### Prefix: can you

- Can you adjust my pillow
- Can you check my BP
- Can you call someone
- Can you turn me
- Can you give me water
- Can you bring my phone

### Prefix: help

- Help me change position
- Help me sit up
- Help me please
- Help me breathe
- Help me with suction

### Prefix: tell

- Tell mummy to take rest
- Tell them I am fine
- Tell the doctor about pain
- Tell staff to come
- Tell bhaiya to call me
- Tell Rishabh to call me
- Tell Parakh to come here
- Tell Bhawana to come here
- Tell Nurse to come here
- Tell Caretaker to come here

### Prefix: call

- Call Rishabh
- Call mummy
- Call the doctor
- Call the nurse
- Call Parakh
- Call Bhawana
- Call Nilesh
- Call Durgesh
- Call Rahul
- Call Caretaker
- Call bhaiya
- Call ambulance
- Call didi

### Prefix: talk to

- Talk to Rishabh
- Talk to Parakh
- Talk to Bhawana
- Talk to Nurse
- Talk to Doctor
- Talk to Caretaker

### Prefix: come here

- Rishabh come here
- Parakh come here
- Bhawana come here
- Nurse come here
- Doctor come here
- Caretaker come here

### Prefix: where

- Where is mummy
- Where is my phone
- Where is the remote
- Where is everyone
- Where is my medicine
- Where is the nurse
- Where is Rishabh
- Where is Bhawana
- Where is Parakh

### Prefix: pain

- Pain in my back
- Pain in my neck
- Pain is increasing
- Pain is less today
- Pain medicine not working

### Prefix: medicine

- Medicine time now
- Medicine is finished
- Medicine is not working
- Give me pain medicine

### Prefix: turn

- Turn me to left side
- Turn me to right side
- Turn on the fan
- Turn off the light
- Turn on the AC
- Turn on the TV

### Prefix: too

- Too cold in here
- Too hot in here
- Too loud please reduce
- Too much pain right now
- Too tired to talk

### Prefix: good

- Good morning
- Good night sweet dreams
- Good afternoon
- Good evening

### Prefix: thank

- Thank you so much
- Thank you for helping
- Thank you for taking care
- Thank you everyone

### Prefix: adjust

- Adjust my pillow
- Adjust bed angle up
- Adjust bed angle down
- Adjust my legs
- Adjust fan speed
- Adjust the AC
- Adjust my neck support
- Adjust my hands
- Adjust head and neck
- Adjust pillows
- Adjust fan and AC

### Prefix: change

- Change my position
- Change the channel
- Change the bedsheet

### Prefix: change to

- Change to channel 508
- Change to channel 511
- Change to channel 521
- Change to channel 524
- Change to channel 310
- Change to channel 132
- Change to channel 128

### Prefix: raise

- Raise my head
- Raise my legs

### Prefix: lower

- Lower my head
- Lower the bed

### Prefix: massage

- Massage hands and legs
- Massage my legs gently

### Prefix: clean

- Clean my face
- Clean my neck area properly
- Clean face and eyes

### Prefix: wipe

- Wipe my face
- Wipe my mouth
- Wipe my eyes

### Prefix: fix

- Fix pillow
- Fix my pillow
- Fix my neck support

### Prefix: give

- Give me water
- Give me medicine
- Give me black tea
- Give me blanket
- Give me nebulization
- Give me sponging
- Give me eye drops
- Give me lip balm

### Prefix: need

- Need blanket
- Need water
- Need bathroom
- Need sponging
- Need suction

### Prefix: scratch

- Scratch my nose
- Scratch my back

### Prefix: remove

- Remove urine pot
- Remove the blanket
- Remove the pillow

### Prefix: cover

- Cover my body properly
- Cover me with blanket

### Prefix: i feel

- I feel uncomfortable
- I feel dizzy
- I feel lonely
- I feel better today
- I feel overwhelmed
- I feel safe with you here
- I feel stiff all over

### Prefix: i need to

- I need to change position
- I need to rest now
- I need to use the bathroom
- I need to call mummy
- I need to sit up
- I need to cough

### Prefix: i want to

- I want to rest
- I want to sleep
- I want to sit up
- I want to talk to family
- I want to listen to music
- I want to go outside

### Prefix: my

- My breathing is difficult
- My back hurts
- My neck hurts
- My mouth is dry
- My chest feels tight
- My position is uncomfortable

### Prefix: i miss

- I miss you
- I miss being outside

### Prefix: wait

- Wait a moment
- Wait I am not finished

### Prefix: let

- Let me think
- Let me finish my sentence
- Let them in
- Let only family come today

### Prefix: speak

- Speak slower please

### Prefix: read

- Read something to me
- Read the screen please
- Read the headlines to me
- Read my messages to me

### Prefix: play

- Play some music
- Play old songs
- Play devotional music
- Play classical music
- Play cricket highlights
- Play soft music for me
- Play news channel
- Play Kishore Kumar songs
- Play comedy videos

### Prefix: alexa

- Alexa play Om chanting
- Alexa play Hanuman Chalisa
- Alexa play Kishore Kumar songs

### Prefix: volume

- Volume up
- Volume down

### Prefix: switch

- Switch ON TV
- Switch OFF TV

### Prefix: lights

- Lights on
- Lights off
- Lights on off

### Prefix: curtains

- Open curtains
- Close curtains
- Open close curtains

### Prefix: open

- Open the curtains
- Open the window I want fresh air **[Too long for lower row]**

### Prefix: close

- Close the window
- Close the door
- Close the curtains

### Prefix: who

- Who is there
- Who is at the door
- Who is visiting today
- Who called just now
- Who is on duty today

### Prefix: when

- When is the doctor coming
- When is the nurse coming
- When is medicine time
- When is my next meal

### Prefix: what

- What time is it now
- What is for dinner tonight
- What is the weather outside
- What is happening today
- What day is it today
- What did the doctor say

### Prefix: how

- How are you
- How are the children doing
- How long until my next medicine
- How is the weather outside

### Prefix: is

- Is the doctor coming
- Is it morning or evening
- Is it raining today

### Prefix: check

- Check my vitals
- Check oxygen level
- Check my BP
- Check my temperature
- Check the machine
- Check on me in thirty minutes
- Check everything before sleeping
- Check vitals O2 pulse
- Check ventilator alarm

### Prefix: do not

- Do not worry about me
- Do not rush
- Do not wake me unless urgent

### Prefix: keep

- Keep water bottle near me
- Keep the bell near my hand
- Keep phone on charging
- Keep a small light on

### Prefix: be

- Be careful
- Be gentle with me

### Prefix: set

- Set the room temperature
- Set my alarm for morning

### Prefix: something

- Something is wrong
- Something is beeping
- Something does not feel right

### Prefix: tt

- TT suction needed now

### Prefix: oral

- Oral suction needed

### Prefix: ambu

- Ambu bag needed now
- Breathing problem ambu bag

### Prefix: breathing

- Breathing problem
- Breathing discomfort
- Breathing problem ambu bag

### Prefix: mosquito

- Mosquito is bothering me

### Prefix: my

- My throat is sore
- My throat feels tight
- My mouth is very dry
- My eyes are very dry
- My chest feels congested
- My breathing feels different
- My neck needs more support
- My hand is sliding down

### Prefix: you

- You are very kind
- You are doing a wonderful job
- You understood me perfectly
- You make my day better

### Prefix: that

- That is better
- That is enough
- That was exactly what I needed
- That feels much better now

### Prefix: leave

- Leave a small light on

### Prefix: hold

- Hold my hand please
- Hold my head please

### Prefix: support

- Support my neck
- Support my back properly
- Support under my arms please

### Prefix: pull

- Pull me up on the bed
- Pull me up in bed

## Complete English abbreviation expansions

Typing a known abbreviation can return its full phrase as a word-stream suggestion. Custom abbreviations can add to or override these mappings. Traditional Keyboard also requests expansion on Space.

| Typed shortcut | Expansion |
| --- | --- |
| gm | Good morning |
| gn | Good night |
| ga | Good afternoon |
| ge | Good evening |
| hw | Hello, how are you? |
| ty | Thank you |
| tyvm | Thank you very much |
| tyh | Thank you for helping |
| tyc | Thank you for taking care |
| yw | You're welcome |
| np | No problem |
| pls | Please |
| plz | Please |
| sry | Sorry |
| gnsd | Good night sweet dreams |
| hbd | Happy birthday |
| atb | All the best |
| tcy | Take care of yourself |
| idk | I don't know |
| idu | I don't understand |
| brb | Be right back |
| lmk | Let me know |
| ttyl | Talk to you later |
| wbf | Everything will be fine |
| dwm | Do not worry about me |
| iaf | I am fine |
| inh | I need help |
| inw | I want water |
| iww | I want warm water |
| iwc | I want cold water |
| ins | I need suction |
| inp | I have pain |
| inm | I need my medicine |
| int | I need to go to the toilet |
| inr | I need rest |
| inb | I need blanket |
| iwt | I want black tea |
| iwe | I want to eat |
| iws | I want to sleep |
| iwp | I want my phone |
| iwm | I want milk |
| iwsu | I want to sit up |
| cmp | Change my position |
| cpl | Change my position to left |
| cpr | Change my position to right |
| pil | Adjust my pillow please |
| blk | Give me blanket |
| rhd | Raise my head |
| lhd | Lower my head |
| imb | I need ambu bag |
| tcs | Too cold in here |
| ths | Too hot in here |
| tml | Turn me to left side |
| tmr | Turn me to right side |
| bpr | Please check my BP |
| bpc | Check my blood pressure |
| doc | Call the doctor |
| nrs | Call the nurse |
| med | Give me medicine |
| mdt | Medicine time now |
| mdf | Medicine is finished |
| neb | Give me nebulization |
| gly | I need glycolate |
| sal | Saliva is thick |
| suc | Please do suction |
| oxy | Check oxygen level |
| amb | Start ambu please |
| ctp | Check my temperature |
| asap | As soon as possible |
| brp | Breathing problem |
| pnb | Pain in my back |
| pnn | Pain in my neck |
| pni | Pain is increasing |
| pnl | Pain is less today |
| tvon | Turn on the TV |
| tvoff | Turn off the TV |
| lon | Turn on the light |
| loff | Turn off the light |
| fon | Turn on the fan |
| foff | Turn off the fan |
| acon | Turn on the AC |
| acoff | Turn off the AC |
| vup | Volume up |
| vdn | Volume down |
| imh | I'm happy |
| ims | I'm sad |
| imt | I'm tired |
| imf | I'm fine |
| imy | I miss you |
| imw | I'm worried |
| imc | I'm comfortable |
| imu | I'm uncomfortable |
| imb2 | I am feeling better today |
| iip | I am in pain |
| ihb | I am having trouble breathing |
| ifw | I am feeling weak |
| ipoy | I am proud of you |
| clm | Call mummy |
| cld | Call the doctor |
| cln | Call the nurse |
| clb | Call bhaiya |
| cla | Call ambulance |
| tif | Tell them I am fine |
| tmtk | Tell mummy to take rest |
| tsc | Tell staff to come |
| tdp | Tell the doctor about pain |
| wim | Where is mummy |
| wip | Where is my phone |
| wir | Where is the remote |
| wie | Where is everyone |
| gmot | Give medicine on time |
| col | Check oxygen level |
| cbs | Change the bedsheet |
| mlg | Massage my legs gently |
| sbp | Support my back properly |
| teth | Turn me every two hours |
| swt | Start with tea and medicine |
| sbb | Give sponge bath before breakfast |
| tfp | Time for physiotherapy |
| abl | Apply body lotion on body |

## AAC phrase bank used for prediction training

This bank seeds the n-gram model and topic keywords. A get_phrases backend endpoint exposes it, but the active frontend screens do not call getPhrases. It is not identical to the visible Phrases board or the full-sentence prediction bank. All English entries follow.

### emergency

- I need help immediately
- Call emergency services
- I'm having trouble breathing
- I need my medication now
- Something is wrong
- I'm in severe pain
- Call the doctor
- I need suction now
- TT suction needed now
- Breathing problem ambu bag

### medical

- I need suction
- Change my position
- I have pain
- I need my medicine
- Check my vitals
- I feel dizzy
- I'm having trouble swallowing
- Adjust my oxygen
- Give me nebulization
- Start ambu bag
- Oral suction needed
- Check vitals O2 pulse
- Ventilator alarm check
- Chest discomfort
- Check blood pressure
- I need glycolate
- Saliva is thick
- Breathing is difficult

### position

- Turn me on my left side
- Turn me on my right side
- Raise my head
- Lower my head
- I want to sit up
- I want to lie down
- Adjust my pillow
- Fix pillow
- Adjust bed angle up
- Adjust bed angle down
- Adjust head and neck
- Straighten my legs
- Bend my knees
- Support my arms
- I keep sliding down
- Cover my body properly
- Back care needed

### basic_needs

- I want water
- I need water
- I'm hungry
- I need to use the bathroom
- I'm cold
- I'm hot
- I'm tired
- I want to sleep
- Turn on the fan
- Turn off the light
- Give me black tea
- Apply body lotion
- I need sponging
- Warm water please
- Give me medicine
- Eye drops
- Lip balm
- Remove urine pot
- Adjust fan speed
- Open close curtains
- Mosquito is bothering me

### comfort

- I'm comfortable
- I'm not comfortable
- That's better
- A little more
- That's enough
- Perfect
- Not quite right
- Try again
- Gently please
- Be careful

### feelings

- I'm happy
- I'm sad
- I'm frustrated
- I'm scared
- I'm bored
- I'm excited
- Thank you
- I appreciate you
- I am improving
- I am hopeful
- I am worried
- I miss you
- Rest is fine

### communication

- Wait a moment
- Let me think
- I don't understand
- Please repeat that
- Speak slower please
- Yes
- No
- Maybe
- I don't know
- Tell me more
- Enough for today
- What else
- Any update
- Good night
- Good morning

### caregiver

- Clean my neck area properly
- Apply lotion on body
- Start black masala tea
- Give me fruit at morning
- Delegate work to staff
- Train the new person
- Tell staff to stay
- Be gentle with me
- Handle carefully
- Don't leave me alone
- Check on me regularly
- Put warm water here

### social

- Good morning
- Good night
- Good evening
- How are you?
- I'm fine
- What's happening?
- Tell me about your day
- I missed you
- Come sit with me
- Let's talk
- Happy birthday
- Happy Diwali
- All the best
- Keep it up
- Call Rishabh
- Call Parakh
- Call Bhawana
- Call Nilesh
- Call Durgesh
- Call Rahul

### entertainment

- Turn on the TV
- Change the channel
- Play some music
- Play old songs
- Read to me
- What's on the news?
- Let's watch a movie
- Volume up
- Volume down
- Play devotional music
- Play Kishore Kumar songs
- Alexa play Om chanting
- Alexa play Hanuman Chalisa
- Switch on TV
- Switch off TV

## Broader training corpus and dynamic phrases

The separate TRAINING_CORPUS has **893 rows**. These train next-word probabilities; they are not 893 guaranteed full-phrase buttons. The full corpus is in [prediction-training-corpus.csv](prediction-training-corpus.csv), with exact text and duplicates preserved.

Patient history is loaded from patient_sentences.json; learned sentences can become suggestions and the first two tokens of frequently used sentences can become starters. Custom shortcuts come from custom_abbreviations.json. Neural continuation and n-gram composition can create text that is not a verbatim preset. No personal runtime files were read for this inventory.

## Findings requiring a separate cleanup decision

1. The backend still retains Hindi and Hinglish sentence templates and abbreviation mappings. Sentence results are not language-filtered by the inspected WebSocket/frontend path; hiding language controls alone does not guarantee English-only suggestions. The non-English entries are deliberately omitted from this English inventory, but this is a real remaining content issue.
2. Legacy contacts (including Nilesh, Durgesh and Rahul) still occur in keyboard templates/training even though the current default People board has six different active contacts.
3. Most screen presets are independently maintained from keyboard templates. A phrase appearing on a care board is not proof that it has an explicit sentence-template entry.

## Source references

- `python/services/sentence_prediction.py`: _build_templates, matching and history.
- `python/main.py`: _get_predictions, _get_starter_predictions and neural continuation wiring.
- `python/services/word_prediction.py`: ABBREVIATIONS, AAC_PHRASES, TRAINING_CORPUS and expansion/learning.
- `src/screens/KeyboardScreen.tsx`: starter fallbacks, shortSentencePredictions and lower-row display.
- `src/App.tsx`: Keyboard receives sentencePredictions; SpatialKeyboard receives only predictions.
- `src/utils/zoneBoardText.ts`: local fallback words and six-entry selection.

See [screen phrase inventory](phrase-inventory.md) for actual board presets and hidden configured entries.
