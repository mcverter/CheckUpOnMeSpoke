Fryda Guedes Today at 12:02 PM
hey folks! @ilona_moveon suggested I post this here.
Having an issue - >200 of my messages were flagged for carrier violations in twilio
Context:
Running a campaign right now texting out to 10,000 people in Long Island (but have only texted about 2,000 so far in the past day)
I started off purchasing 2 numbers with 631 area code (Nassau County)
Once I received my first carrier violations, I released the numbers I had and purchased 4 additional numbers, but I am still seeing carrier violations pop up and I go ahead and buy more numbers. No idea if that's what I should do.
My initial message: Hi {firstName}, this is {texterFirstName}, a volunteer with the Long Island Civic Engagement Table. At this crucial time I hope you and your family are safe. The 2020 Census determines resources and representation for the next ten years and we must all be counted. Can you fill out the Census today? ¿Prefiere español?

ilona_moveon  10 hours ago
@sky_moveon @ben-pr-p @Jeff Mann @Joe McLaughlin @Barbara Atkins @Larry Person (he/him) @bchrobot
Any of you have insights on this?

bchrobot:whale:  10 hours ago
The CTIA (telecom industry association) has guidelines for what constitutes P2P traffic

bchrobot:whale:  10 hours ago
Basically, it has to look like an actual person is sending it

bchrobot:whale:  10 hours ago
The two big things there are
unique people contacted per day (most humans don't text more than 200 other humans in a day)
rate of sending (most human don't send more than 6 texts a minute)

bchrobot:whale:  10 hours ago
So for contacting 2,000 unique recipients in one day you would want to be sending from at least 10 phone numbers
:exploding_head:
1
:+1:
2
:thanks:
1


Fryda Guedes  10 hours ago
@bchrobot THANK YOU! Understood. That helps a lot. Given we are contacting about 4,000 unique recipients each day I'll go ahead and purchase 20 phone numbers?

Fryda Guedes  10 hours ago
@bchrobot how would you control for rate of sending, other than asking your volunteers to slow down?

ilona_moveon  10 hours ago
Wow I would love to have some guidelines around how many numbers to buy. Every time I’ve asked for docs I’ve gotten fairly hand wavy answers

bchrobot:whale:  10 hours ago
for 4,000, yeah, you would want at least 20 phone numbers

bchrobot:whale:  10 hours ago
The geomatching that Twilio does can throw that off though

bchrobot:whale:  10 hours ago
If you have
2000 recipients in area code 617
2 (617) phone numbers
18 (503) phone numbers
you'll have problems because all 2000 will get routed to the two 617 area codes

bchrobot:whale:  10 hours ago
or at least, that's what Twilio engineering said this time last year

Fryda Guedes  10 hours ago
Oh. OK. So it's very helpful to have a sense of what numbers you are contacting. @ilona_moveon would be amazing if that could be incorporated into Spoke's upcoming feature for purchasing numbers from within Spoke? (edited) 
:heavy_plus_sign:
1
:point_up:
1


Fryda Guedes  10 hours ago
@bchrobot let's say I have folks from various area codes but I only buy numbers from area code 613 - Twilio will be forced to use my numbers to contact everyone, no?

bchrobot:whale:  10 hours ago
Regarding controlling for rate, I think that Twilio does automatic queuing of messages to comply with that. Other telecom providers do not (I know there are a few open issues about supporting telecom providers other than Twilio)
:heavy_check_mark:
1


bchrobot:whale:  10 hours ago
@ilona_moveon if you haven't seen these yet, these are the full ctia guidelines:
https://api.ctia.org/wp-content/uploads/2019/07/190719-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf
:raised_hands:
2


bchrobot:whale:  10 hours ago
Section What is Typical Consumer Operation? being the useful bits for this context
:white_check_mark:
1


bchrobot:whale:  10 hours ago
@Fryda Guedes yes, I think so. The Twilio engineers we spoke to didn't really have an answer for how the "distribute traffic evenly" and "geomatch" features worked together
:heavy_check_mark:
1


Joe McLaughlin  10 hours ago
You basically don't want to try sending more than 200 texts in one day from one number.

bchrobot:whale:  10 hours ago
When we were using Twilio messaging services, we opted to disable geomatching and only use "distribute traffic evenly" (or a similarly named option -- I don't remember exactly what it's called)
:heavy_check_mark:
2


Joe McLaughlin  10 hours ago
And check out the switchboard Twilio tool in MoveOn's other repo for provisioning a bunch of numbers quickly
:heavy_check_mark:
2


Fryda Guedes  10 hours ago
thanks @Joe McLaughlin - about to try to use switchboard asap since folks are texting as we speak :sunglasses:

Joe McLaughlin  10 hours ago
@Fryda Guedes Cool, it's a command line tool, takes a little bit of setup as well.
:heavy_check_mark:
1


Joe McLaughlin  10 hours ago
I will typically provision like 100 phone numbers in the area code we're sending to

Joe McLaughlin  10 hours ago
Also I haven't really checked it out yet at all but look at what the Warren campaign posted on medium about scaling up. @bchrobot have you looked at that? The Warren campaign has their fork on a repo somewhere, there's a link here. (edited) 
:+1:
2


bchrobot:whale:  10 hours ago
I have not had a chance to sit down and go through what they've released in detail yet

Fryda Guedes  10 hours ago
yeah, i'm gonna need to wait to set up switchboard since I've gotta move quickly. Downloaded the requirements but not much I could do right now.

Fryda Guedes  10 hours ago
Would love to see the link @Joe McLaughlin

bchrobot:whale:  10 hours ago
I know one of the Warren Spoke developers, Ben Weissmann, from undergrad actually and we had a call to talk about the design decisions they had made
:100:
2
:dance-hamster:
2
:+1:
1


Larry Person (he/him):distress:  10 hours ago
Fuzzy!

ilona_moveon  10 hours ago
@Matteo Banerjee if you have any thoughts about number buying on short notice

bchrobot:whale:  10 hours ago
yup!

ilona_moveon  10 hours ago
for an active campaign that @Fryda Guedes is running with NYCET and LICET specifically

bchrobot:whale:  10 hours ago
One decision they made was that they wanted each conversation to come from a unique phone number, and not to have the same contact be texted from the same number across campaigns
:white_check_mark:
1


Fryda Guedes  10 hours ago
as someone who is not incredibly proficient in dev stuff, I hit a roadblock in switchboard - https://github.com/MoveOnOrg/switchboard-twilio
(aka, after typing in cd switchboard-twilio and not finding a directory) anyway - i'll ask for help for this another time (maybe @ilona_moveon?) (edited) 
:+1:
1


ilona_moveon  10 hours ago
I’ll look into switchboard!
:dance-hamster:
1


Fryda Guedes  10 hours ago
@bchrobot that's great for campaigns with committed volunteers but I can see issues pop up with campaigns that cycle through people a ton, unless it's super easy to buy and release numbers

Joe McLaughlin  10 hours ago
@Fryda Guedes once you have switchboard twilio set up, it's very fast to provision and release numbers, yeah.
:heavy_check_mark:
2
:the_horns:
1


Fryda Guedes  10 hours ago
no rush, @ilona_moveon doing it manually right now

ilona_moveon  10 hours ago
++ sounds good. Maybe we could create a doc based on comments in this thread with number buying guidelines
:100:
1


bchrobot:whale:  10 hours ago
Right, the managing of phone numbers and messaging services at the scale they were operating at was something that Fuzzy said was tricky

bchrobot:whale:  10 hours ago
They had a separate tool/script set to manage on-the-fly provisioning of one messaging service per Spoke campaign (edited) 
:heavy_check_mark:
1


bchrobot:whale:  10 hours ago
That's also a decision you'd want to make about contact experience. Do you want it to feel like one ongoing conversation over many Spoke campaigns? Or do you want the contact to feel some social pressure/validation of the cause from having many different numbers texting them?
:100:
1


bchrobot:whale:  10 hours ago
¯\_(ツ)_/¯

sky_moveon:horse:  10 hours ago
That might be a per org decision
:white_check_mark:
1


Matteo Banerjee  9 hours ago
:wave::skin-tone-3: I wrote the messaging service backend for Warren Spoke. Happy to answer any questions. We more-or-less enforced the 200 msg/day cap on phone numbers with our per-campaign messaging services
:smile:
2


Matteo Banerjee  9 hours ago
it's really a soft limit, if you have a high reply rate and low opt out rate you can push the recipients per day significantly higher

ilona_moveon  9 hours ago
in that case, would you advocate for 1 number per 200 contacts-ish?

Matteo Banerjee  9 hours ago
yes
:+1:
1


Matteo Banerjee  9 hours ago
in warren spoke we divided the number of contacts in a campaign by 200 and provisioned that many numbers in twilio
:+1:
2


Matteo Banerjee  9 hours ago
I would not go higher for voterfile texting

Matteo Banerjee  9 hours ago
if you know you are going to have a high reply rate and low opt-out rate you can push it higher, though CTIA enforcement could change at any time (edited) 
:heavy_plus_sign:
1


Jeff Mann  9 hours ago
that’s super interesting. in our 2019 texting we had a significantly higher ratio, more like 500:1, and our error rate was around 5%. but we were texting members so maybe our response rate was high enough to get away with it
:heavy_check_mark:
1


Joe McLaughlin  9 hours ago
And a big shout out to @shaka_moveon for creating swtichboard-twilio :slightly_smiling_face:
:rainbowheart:
1
:100:
1
:star-struck:
1
:dance-hamster:
1


Joe McLaughlin  7 hours ago
@bchrobot are you no longer using Twilio, and if so what have you switched to?

Arena  6 hours ago
I’m not a technical expert on this … but you reminded me to get my census done
