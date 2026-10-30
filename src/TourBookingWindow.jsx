import React, { useState, useEffect } from 'react';
import WeatherNotice from './ui/WeatherNotice';
import { supabase } from './supabaseClient';
import { toast, reportError } from './ui/toast';
import { withAvailableSlots, formatPeso, downpaymentFor, DOWNPAYMENT_PERCENT, formatPickupTime, effectivePrice, isOnSale } from './tourUtils';
import { TripDatePicker } from './ui/TripDates';
import { startCheckout } from './payments';
import { fullNameError, phoneError, cleanName, normalizePhone } from './validation';
import { MapPin, Clock, Users, Calendar, ChevronDown, Loader2, CheckCircle2, X, AlertCircle, CreditCard, ArrowLeft, Check, BedDouble } from 'lucide-react';
import { phoneFieldProps } from './ui/phoneField';
import { AccommodationSelect } from './ui/Accommodation';
import { cleanAccommodation } from './accommodation';
import ItineraryTimeline from './ui/ItineraryTimeline';
import PrettySelect from './ui/PrettySelect';
import { ViewSection, ChecklistGrid, TourImageCarousel } from './TourDetailParts';

// ─────────────────────────────────────────────
// BOOKING WINDOW (Explore Tours → View Details): pick a date, pickup point,
// accommodation and number of persons, enter everyone's names, then pay with
// PayMongo (full or downpayment). Full tours offer the waitlist instead.
// ─────────────────────────────────────────────

/* ─────────────────────────────────────────────

   TOUR DETAILS + BOOKING MODAL

───────────────────────────────────────────── */

// Booking window. A trip with several dates (tour.dates, from groupTripDates)
// shows a date picker; each date is its own tour, so picking one swaps the
// window over to that date's slots, waitlist and booking.
const DetailedTourModal = ({ tour, ...props }) => {
    const dates = tour.dates?.length ? tour.dates : [tour];
    const [activeId, setActiveId] = useState(tour.id);
    const active = dates.find((d) => d.id === activeId) || dates[0];
    return <TourBookingWindow key={active.id} {...props} tour={active} dates={dates} onPickDate={setActiveId} />;
};

const TourBookingWindow = ({ tour, dates, onPickDate, onClose, formatDateRange }) => {

    const images = tour.image_urls || [];

    const [numPersons, setNumPersons] = useState(1);
    // Pickup point the joiner picks from this date's pickup stops (tour_pickup_points()).
    const [pickupPoints, setPickupPoints] = useState(null); // null = loading
    const [pickupPoint, setPickupPoint] = useState('');
    const [pickupError, setPickupError] = useState('');
    // Accommodation, when the tour offers a choice (Tent, AC Room, Non-AC Room).
    const [accommodation, setAccommodation] = useState('');
    const [accommodationError, setAccommodationError] = useState('');
    const accommodationChoices = cleanAccommodation(tour.accommodation_options);
    useEffect(() => {
        let active = true;
        supabase.rpc('tour_pickup_points', { p_tour_id: tour.id })
            .then(({ data, error }) => { if (active) setPickupPoints(error ? [] : data || []); });
        return () => { active = false; };
    }, [tour.id]);

    const [isBooking, setIsBooking] = useState(false);

    const [slotError, setSlotError] = useState("");

    const [paymentStep, setPaymentStep] = useState(null);


    const [redirectingToPayment, setRedirectingToPayment] = useState(false);
    // Everyone joining besides the person booking (persons 2..N): name + contact each.
    const [companions, setCompanions] = useState([]);
    const [companionError, setCompanionError] = useState("");
    // Waitlist, shown when the tour is full.
    const [myWaitlist, setMyWaitlist] = useState(null);
    const [waitlistSlots, setWaitlistSlots] = useState(1);
    const [waitlistBusy, setWaitlistBusy] = useState(false);
    // The joiner's own active booking on this date: booked joiners can't join its waitlist.
    const [myBookingNumber, setMyBookingNumber] = useState(null);

    // Slots left on this date, re-checked when the window opens so the
    // Number of Persons choices match what's really left.
    const [liveSlots, setLiveSlots] = useState(tour.available_slots || 0);
    useEffect(() => {
        let active = true;
        withAvailableSlots([tour]).then(([fresh]) => { if (active && fresh) setLiveSlots(fresh.available_slots); });
        return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tour.id]);
    const isFullyBooked = liveSlots <= 0;
    const isAlmostFull = !isFullyBooked && liveSlots <= 3;
    const maxBookingLimit = Math.max(0, liveSlots);
    // On sale on this date: 5% off the Joiner Rate (the database charges the same).
    const subtotal = effectivePrice(tour) * numPersons;
    const downpaymentAmount = downpaymentFor(subtotal);
    const filledPct = Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100);

    useEffect(() => {
        let active = true;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const [{ data }, { data: booking }] = await Promise.all([
                supabase
                    .from('tour_waitlist')
                    .select('id, slots_wanted, notified_at')
                    .eq('tour_id', tour.id)
                    .eq('user_id', user.id)
                    .maybeSingle(),
                supabase
                    .from('bookings')
                    .select('booking_number')
                    .eq('tour_id', tour.id)
                    .eq('user_id', user.id)
                    .not('booking_status', 'in', '("Cancelled","Rejected")')
                    .limit(1)
                    .maybeSingle(),
            ]);
            if (!active) return;
            setMyWaitlist(data || null);
            setMyBookingNumber(booking?.booking_number || null);
        })();
        return () => { active = false; };
    }, [tour.id]);

    const handlePersonsChange = (count) => {
        setNumPersons(count);
        setCompanions((prev) => Array.from({ length: count - 1 }, (_, i) => prev[i] || { full_name: '', contact_number: '' }));
        setSlotError("");
        setCompanionError("");
    };

    const updateCompanion = (index, field, value) => {
        setCompanions((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
        setCompanionError("");
    };

    // Nothing is reserved here: slots are held only once the joiner picks a
    // payment type and goes to PayMongo (start_online_booking). These checks just
    // stop a joiner from starting checkout for a tour that's full or already booked.
    // The names pop-up: every person joining needs a full name and contact number.
    const checkCompanions = () => {
        setCompanionError("");
        if (companions.some((c) => !c.full_name.trim() || !c.contact_number.trim())) {
            setCompanionError("Please enter the name and contact number of each person joining you.");
            return false;
        }
        // Typing mistakes in the companions' details (wrong number format, one-word names, the same person twice).
        // Two people may share a contact number (e.g. a mother and her child).
        for (let i = 0; i < companions.length; i++) {
            const c = companions[i];
            const problem = fullNameError(c.full_name, `Person ${i + 2}'s name`)
                || phoneError(c.contact_number, `Person ${i + 2}'s contact number`, { mobile: true });
            if (problem) { setCompanionError(problem); return false; }
        }
        const names = companions.map((c) => cleanName(c.full_name).toLowerCase());
        const repeated = names.find((n, i) => names.indexOf(n) !== i);
        if (repeated) {
            setCompanionError(`"${companions[names.indexOf(repeated)].full_name.trim()}" is entered more than once. Each person joining needs their own details.`);
            return false;
        }
        return true;
    };

    const handleBookThisTour = async () => {
        setSlotError("");
        setCompanionError("");
        if (pickupPoints?.length && !pickupPoint) {
            setPickupError('Please choose your pickup point.');
            return;
        }
        if (accommodationChoices.length && !accommodation) {
            setAccommodationError('Please choose your accommodation.');
            return;
        }
        setIsBooking(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.info('Please log in to book a tour.'); setIsBooking(false); return; }

        const [fresh] = await withAvailableSlots([tour]);
        setLiveSlots(fresh.available_slots);
        if (numPersons > fresh.available_slots) {
            if (fresh.available_slots > 0) handlePersonsChange(fresh.available_slots);
            setSlotError(fresh.available_slots <= 0
                ? "Sorry, this tour is now fully booked."
                : `Only ${fresh.available_slots} slot${fresh.available_slots > 1 ? 's' : ''} remaining. Please reduce the number of persons.`);
            setIsBooking(false);
            return;
        }

        const { data: existingBooking } = await supabase
            .from('bookings')
            .select('booking_number')
            .eq('tour_id', tour.id)
            .eq('user_id', user.id)
            .not('booking_status', 'in', '("Cancelled","Rejected")')
            .maybeSingle();
        if (existingBooking) {
            setSlotError(`You already have an active booking for this tour (${existingBooking.booking_number}). Please check My Bookings.`);
            setIsBooking(false);
            return;
        }

        setIsBooking(false);
        // Booking for a group: enter everyone's names in a pop-up first.
        setPaymentStep(companions.length > 0 ? 'names' : 'proceed');
    };

    const handleJoinWaitlist = async () => {
        setWaitlistBusy(true);
        const { data, error } = await supabase
            .from('tour_waitlist')
            .insert([{ tour_id: tour.id, slots_wanted: waitlistSlots }])
            .select('id, slots_wanted, notified_at')
            .single();
        if (error) toast.error("Couldn't join the waitlist", error.message);
        else { setMyWaitlist(data); toast.success("You're on the waitlist", "We'll notify and email you if a slot opens."); }
        setWaitlistBusy(false);
    };

    const handleLeaveWaitlist = async () => {
        setWaitlistBusy(true);
        const { error } = await supabase.from('tour_waitlist').delete().eq('id', myWaitlist.id);
        if (error) toast.error("Couldn't leave the waitlist", error.message);
        else { setMyWaitlist(null); toast.info('You left the waitlist.'); }
        setWaitlistBusy(false);
    };

    // Online payment: hold the slots and go to PayMongo's secure checkout page.
    const handleChoosePaymentType = async (type) => {
        setRedirectingToPayment(true);
        const { ok, data, error } = await startCheckout({
            tourId: tour.id,
            slots: numPersons,
            paymentType: type,
            companions: companions.map((c) => ({ full_name: cleanName(c.full_name), contact_number: normalizePhone(c.contact_number) || c.contact_number.trim() })),
            accommodation: accommodation || null,
        });
        if (!ok) {
            toast.error("Couldn't start the payment", error);
            setRedirectingToPayment(false);
            return;
        }
        // Save the chosen pickup point on the new booking (it can still be changed in My Bookings).
        if (pickupPoint && data.bookingId) {
            const { error: pickupSaveError } = await supabase.from('bookings').update({ pickup_point: pickupPoint }).eq('id', data.bookingId);
            if (pickupSaveError) reportError("Your pickup point wasn't saved", pickupSaveError.message);
        }
        window.location.assign(data.checkoutUrl);
    };



    return (

        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>

            <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={paymentStep ? undefined : onClose} />

            <div style={{

                position: 'relative', background: '#FDF6EE',

                width: '100%', maxWidth: 1100,

                borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',

                borderTop: '8px solid #B4511E',

                overflow: 'hidden',

                maxHeight: '92dvh',

                display: 'flex', flexDirection: 'column',

            }}>

                <button onClick={onClose} style={{

                    position: 'absolute', top: 24, right: 24, zIndex: 50,

                    background: 'none', border: 'none', cursor: 'pointer',

                    color: 'rgba(122,58,24,0.85)',

                }}><X size={28} /></button>



                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

                    <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>



                        {/* Left panel */}

                        <div className="responsive-modal-padding" style={{

                            background: '#F2E4D0',

                            padding: '2.5rem 2rem',

                            borderRight: '1px solid rgba(180,81,30,0.12)',

                            display: 'flex', flexDirection: 'column',

                        }}>

                            <TourImageCarousel images={images} />



                            <h2 style={{

                                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',

                                color: '#1A0A00', margin: '0 0 18px', lineHeight: 1.15,

                            }}>{tour.title}</h2>

                            {dates.length > 1 && (
                                <div style={{ marginBottom: 18 }}>
                                    <TripDatePicker dates={dates} activeId={tour.id} onPick={onPickDate} disabled={Boolean(paymentStep)} />
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

                                {[

                                    { icon: <MapPin size={16} />, text: tour.destination },

                                    { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },

                                    { icon: <Clock size={16} />, text: tour.duration },

                                ].map((row, i) => (

                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>

                                        <span style={{ color: '#A8481A' }}>{row.icon}</span> {row.text}

                                    </div>

                                ))}

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFullyBooked ? '#8C2F1C' : '#7A3A18' }}>

                                    <span style={{ color: '#A8481A' }}><Users size={16} /></span>

                                    {tour.current_booked} / {tour.group_size} Slots Booked

                                </div>

                                <div style={{ background: 'rgba(180,81,30,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>

                                    <div style={{

                                        height: '100%', borderRadius: 999,

                                        width: `${filledPct}%`,

                                        background: isFullyBooked ? '#8C2F1C' : isAlmostFull ? '#E8A265' : '#7A3A18',

                                        transition: 'width 0.4s',

                                    }} />

                                </div>

                                <span style={{

                                    display: 'inline-block',

                                    background: '#FDF6EE',

                                    border: '1px solid rgba(180,81,30,0.2)',

                                    borderRadius: 999, padding: '4px 14px',

                                    fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',

                                    color: '#1A0A00', width: 'fit-content',

                                }}>{tour.difficulty}</span>



                                {isFullyBooked ? (

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(140,47,28,0.1)', border: '1px solid rgba(140,47,28,0.25)', borderRadius: 14, padding: '10px 14px' }}>

                                        <AlertCircle size={16} style={{ color: '#8C2F1C', flexShrink: 0 }} />

                                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8C2F1C', margin: 0 }}>Fully Booked</p>

                                    </div>

                                ) : isAlmostFull ? (

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 14, padding: '10px 14px' }}>

                                        <AlertCircle size={16} style={{ color: '#A8481A', flexShrink: 0 }} />

                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', margin: 0 }}>Only {liveSlots} slot{liveSlots > 1 ? 's' : ''} left!</p>

                                    </div>

                                ) : null}

                            </div>



                            {!isFullyBooked && (
                                <div style={{ marginBottom: 16 }}>
                                    <label htmlFor="pickup-point" style={{
                                        display: 'block', fontSize: 11, fontWeight: 800,
                                        letterSpacing: '0.2em', textTransform: 'uppercase',
                                        color: '#7A3A18', opacity: 0.9, marginBottom: 6,
                                    }}>Pickup Point</label>
                                    {pickupPoints === null ? (
                                        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0 }}>Loading pickup points…</p>
                                    ) : pickupPoints.length === 0 ? (
                                        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>
                                            Pickup points will be posted soon. You can choose yours later in My Bookings.
                                        </p>
                                    ) : (
                                        <>
                                            <PrettySelect
                                                id="pickup-point"
                                                icon={MapPin}
                                                value={pickupPoint}
                                                placeholder="Choose your pickup point"
                                                invalid={!!pickupError}
                                                onChange={(v) => { setPickupPoint(v); setPickupError(''); }}
                                                options={pickupPoints.map((p) => ({ value: p.location_name, label: p.location_name, hint: p.scheduled_time ? formatPickupTime(p.scheduled_time) : '' }))}
                                            />
                                            {pickupError && <p role="alert" style={{ fontSize: 12, fontWeight: 800, color: '#8C2F1C', margin: '6px 2px 0' }}>{pickupError}</p>}
                                        </>
                                    )}
                                </div>
                            )}

                            {!isFullyBooked && accommodationChoices.length > 0 && (
                                <AccommodationSelect
                                    options={accommodationChoices}
                                    value={accommodation}
                                    onChange={(v) => { setAccommodation(v); setAccommodationError(''); }}
                                    error={accommodationError}
                                />
                            )}

                            {!isFullyBooked && (

                                <div style={{ marginBottom: 20 }}>

                                    <label style={{

                                        display: 'block', fontSize: 11, fontWeight: 800,

                                        letterSpacing: '0.2em', textTransform: 'uppercase',

                                        color: '#7A3A18', opacity: 0.9, marginBottom: 6,

                                    }}>Number of Persons</label>

                                    <PrettySelect
                                        ariaLabel="Number of persons"
                                        icon={Users}
                                        value={numPersons}
                                        onChange={(v) => handlePersonsChange(Number(v))}
                                        options={[...Array(maxBookingLimit)].map((_, i) => ({ value: i + 1, label: `${i + 1} ${i === 0 ? 'Person' : 'Persons'}` }))}
                                    />

                                    {slotError && (

                                        <p style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#8C2F1C', display: 'flex', alignItems: 'center', gap: 6 }}>

                                            <AlertCircle size={13} /> {slotError}

                                        </p>

                                    )}

                                    {companions.length > 0 && (
                                        <p style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', lineHeight: 1.5 }}>
                                            Next, you'll enter the name and contact number of the {companions.length} {companions.length === 1 ? 'person' : 'people'} joining you.
                                        </p>
                                    )}

                                </div>

                            )}



                            <div style={{ marginTop: 20 }}>

                                {!isFullyBooked && (

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>

                                        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9 }}>Total</span>

                                        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: '#A8481A' }}>{formatPeso(subtotal)}</span>

                                    </div>

                                )}

                                {isFullyBooked && (

                                    <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{formatPeso(effectivePrice(tour))} per person</p>

                                )}

                                {isFullyBooked && (
                                    <WaitlistPanel
                                        entry={myWaitlist}
                                        bookingNumber={myBookingNumber}
                                        slots={waitlistSlots}
                                        onSlotsChange={setWaitlistSlots}
                                        busy={waitlistBusy}
                                        onJoin={handleJoinWaitlist}
                                        onLeave={handleLeaveWaitlist}
                                    />
                                )}

                                {!isFullyBooked && <button

                                    onClick={handleBookThisTour}

                                    disabled={isBooking || isFullyBooked}

                                    style={{

                                        width: '100%', padding: '14px 0',

                                        background: isFullyBooked ? '#EDEAE3' : '#B4511E',

                                        color: isFullyBooked ? '#7A3A18' : '#FDF6EE',

                                        border: 'none', borderRadius: 14, cursor: isFullyBooked ? 'not-allowed' : 'pointer',

                                        fontFamily: 'inherit', fontWeight: 900,

                                        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',

                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,

                                        boxShadow: isFullyBooked ? 'none' : '0 6px 18px rgba(180,81,30,0.32)',

                                        transition: 'background 0.2s',

                                    }}

                                    onMouseEnter={e => { if (!isFullyBooked && !isBooking) e.currentTarget.style.background = '#1A0A00'; }}

                                    onMouseLeave={e => { if (!isFullyBooked && !isBooking) e.currentTarget.style.background = '#B4511E'; }}

                                >

                                    {isBooking ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <><CreditCard size={14} /> Book This Tour</>}

                                </button>}

                            </div>

                        </div>



                        {/* Right panel */}

                        <div style={{ display: 'flex', flexDirection: 'column' }}>

                            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>



                                <ViewSection title="About the Tour">

                                    <p style={{ fontSize: 14, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>

                                        {tour.description || 'No description provided.'}

                                    </p>

                                </ViewSection>



                                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Inclusions" titleColor="#A8481A" icon={<CheckCircle2 size={14} />}>

                                        <ChecklistGrid text={tour.inclusions} variant="include" />

                                    </ViewSection>

                                    <ViewSection title="Exclusions" titleColor="#8C2F1C" icon={<X size={14} />}>

                                        <ChecklistGrid text={tour.exclusions} variant="exclude" />

                                    </ViewSection>

                                </div>



                                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Itinerary" titleColor="#A8481A" icon={<Clock size={14} />}>

                                        <ItineraryTimeline text={tour.itinerary} startDate={tour.start_date} />

                                    </ViewSection>

                                </div>



                                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Things to Bring">

                                        <ChecklistGrid text={tour.things_to_bring} variant="neutral" />

                                    </ViewSection>

                                </div>



                                {tour.important_note && (

                                    <div style={{

                                        background: 'rgba(180,81,30,0.07)',

                                        borderRadius: 18, padding: '1.5rem',

                                        border: '1px solid rgba(180,81,30,0.2)',

                                        display: 'flex', gap: 16,

                                    }}>

                                        <AlertCircle size={22} style={{ color: '#A8481A', flexShrink: 0 }} />

                                        <div>

                                            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>

                                                Important Note

                                            </p>

                                            <pre style={{ fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.7, color: '#1A0A00', whiteSpace: 'pre-wrap', margin: 0 }}>

                                                {tour.important_note}

                                            </pre>

                                        </div>

                                    </div>

                                )}

                                <WeatherNotice />

                            </div>

                        </div>

                    </div>

                </div>

            </div>



            {/* Payment Flow Overlays */}

            {paymentStep === 'proceed' && (

                <ProceedToPaymentModal

                    tour={tour}

                    numPersons={numPersons}
                    pickupPoint={pickupPoint}

                    subtotal={subtotal}

                    onProceed={() => setPaymentStep('choose')}

                    accommodation={accommodation}
                    onCancel={() => setPaymentStep(companions.length > 0 ? 'names' : null)}  // back a step, choices kept

                    formatDateRange={formatDateRange}

                />

            )}



            {paymentStep === 'names' && (
                <CompanionsModal
                    companions={companions}
                    onChange={updateCompanion}
                    error={companionError}
                    onBack={() => setPaymentStep(null)}
                    onContinue={() => { if (checkCompanions()) setPaymentStep('proceed'); }}
                />
            )}

            {paymentStep === 'choose' && (

                <ChoosePaymentTypeModal

                    subtotal={subtotal}

                    downpaymentAmount={downpaymentAmount}

                    fullOnly={isOnSale(tour)}

                    onChoose={handleChoosePaymentType}

                    busy={redirectingToPayment}

                    onBack={() => setPaymentStep('proceed')}

                />

            )}


        </div>

    );

};



/* ─────────────────────────────────────────────

   PAYMENT FLOW OVERLAYS

───────────────────────────────────────────── */



const overlayBackdrop = {

    position: 'fixed', inset: 0, zIndex: 10000, display: 'flex',

    alignItems: 'center', justifyContent: 'center', padding: 16,

    background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)',

};



const ProceedToPaymentModal = ({ tour, numPersons, pickupPoint, accommodation, subtotal, onProceed, onCancel, formatDateRange }) => {

  return (

    <div style={overlayBackdrop}>

      <div style={{

        background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',

        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #B4511E',

      }}>

        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <button onClick={onCancel} aria-label="Back to tour details" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'inherit', padding: 0 }}>
              <ArrowLeft size={14} /> Back
            </button>

            <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18' }}>Step 1 of 2</span>

          </div>

          <div>

            <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 4px' }}>Booking Preview</p>

            <h3 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0 }}>{tour.title}</h3>

          </div>

          <div style={{ background: '#F2E4D0', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <MapPin size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {tour.destination}

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <Calendar size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {formatDateRange(tour.start_date, tour.duration)}

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <Users size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}

            </div>
            {pickupPoint && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>
                <MapPin size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> Pickup: {pickupPoint}
              </div>
            )}
            {accommodation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>
                <BedDouble size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> Accommodation: {accommodation}
              </div>
            )}

          </div>

          <div style={{ borderTop: '2px solid rgba(180,81,30,0.12)', paddingTop: 18 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>

              <span style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', opacity: 0.9 }}>Price per person</span>

              <span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>
                {isOnSale(tour) && <span style={{ textDecoration: 'line-through', fontWeight: 700, color: 'rgba(122,58,24,0.75)', marginRight: 6 }}>{formatPeso(tour.price)}</span>}
                {formatPeso(effectivePrice(tour))}
              </span>

            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <span style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1A0A00' }}>Subtotal</span>

              <span style={{ fontSize: 28, fontWeight: 900, color: '#A8481A' }}>{formatPeso(subtotal)}</span>

            </div>

          </div>

          <button onClick={onProceed}

            style={{

              width: '100%', padding: '15px 0', background: '#1A0A00', color: '#FDF6EE',

              border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',

              fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',

              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,

              transition: 'background 0.2s',

            }}

            onMouseEnter={e => e.currentTarget.style.background = '#B4511E'}

            onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}

          >

            <CreditCard size={16} /> Proceed to Payment

          </button>

        </div>

      </div>

    </div>

  );

};



// fullOnly: a date on sale is paid in full (no downpayment).
const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack, busy, fullOnly = false }) => {
    // Joiners tick the non-refundable agreement before they can pay.
    const [agreed, setAgreed] = useState(false);
    return (

    <div style={overlayBackdrop}>

        <div style={{

            background: '#FDF6EE', width: '100%', maxWidth: 420, maxHeight: '92dvh', overflowY: 'auto',

            padding: '2rem', borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',

            textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20,

            borderTop: '8px solid #B4511E',

        }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>

                    <ArrowLeft size={14} /> Back

                </button>

                <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18' }}>Step 2 of 2</span>

            </div>

            <div>

                <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>Choose Payment Type</h3>

                <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.9, margin: '8px 0 0' }}>How would you like to pay for your booking?</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
                    You'll pay on PayMongo's secure page with GCash, Maya, card or GrabPay. Your slots are held for 30 minutes.
                </p>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#8C2F1C', margin: '8px 0 0' }}>
                    Payments are non-refundable. You can cancel up to 14 days before the tour, but the amount paid won't be returned.
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', marginTop: 12, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1A0A00', lineHeight: 1.55, background: 'rgba(140,47,28,0.06)', border: '1px solid rgba(140,47,28,0.18)', borderRadius: 14, padding: '10px 12px' }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: '#B4511E', flexShrink: 0 }} />
                    <span>I agree that my payment is <strong>non-refundable</strong>, that cancellations close 14 days before the tour, and that the tour date <strong>may be moved because of bad weather</strong> or other safety concerns.</span>
                </label>

            </div>



            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>

                <button

                    onClick={() => onChoose('full')}
                    title={agreed ? undefined : 'Tick the agreement above first'}
                    disabled={busy || !agreed}

                    style={{ width: '100%', background: '#1A0A00', color: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', border: 'none', boxShadow: '0 8px 24px rgba(26,10,0,0.25)', transition: 'background 0.2s', opacity: agreed ? 1 : 0.45, cursor: agreed ? 'pointer' : 'not-allowed' }}

                    onMouseEnter={e => e.currentTarget.style.background = '#2D1B0E'}

                    onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}

                >

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>

                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>Full Payment</span>

                        <Check size={16} style={{ color: '#E8A265' }} />

                    </div>

                    <p style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{formatPeso(subtotal)}</p>

                    <p style={{ fontSize: 11, opacity: 0.9, fontWeight: 500, margin: '4px 0 0' }}>Pay the complete amount now</p>

                </button>



                {fullOnly ? (
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', background: 'rgba(140,47,28,0.08)', borderRadius: 14, padding: '10px 14px', margin: 0, textAlign: 'left', lineHeight: 1.5 }}>
                        This date is on sale, so it must be paid in full. Downpayment isn't available.
                    </p>
                ) : (
                <button

                    onClick={() => onChoose('down')}
                    title={agreed ? undefined : 'Tick the agreement above first'}
                    disabled={busy || !agreed}

                    style={{ width: '100%', background: '#F2E4D0', border: '2px solid rgba(180,81,30,0.18)', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', transition: 'border-color 0.2s', opacity: agreed ? 1 : 0.45, cursor: agreed ? 'pointer' : 'not-allowed' }}

                    onMouseEnter={e => e.currentTarget.style.borderColor = '#B4511E'}

                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(180,81,30,0.18)'}

                >

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>

                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A' }}>Downpayment ({DOWNPAYMENT_PERCENT}%)</span>

                        <span style={{ fontSize: 11, fontWeight: 900, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', flexShrink: 0 }}>Balance Later</span>

                    </div>

                    <p style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{formatPeso(downpaymentAmount)}</p>

                    <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.9, fontWeight: 500, margin: '4px 0 0' }}>Pay 50% now; pay the rest online later or in person on the tour day</p>

                </button>
                )}

            </div>
            {busy && (
                <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#A8481A', margin: 0 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Opening secure checkout…
                </p>
            )}

        </div>

    </div>

);
};






/* ─────────────────────────────────────────────
   GROUP BOOKING: details of everyone else joining
───────────────────────────────────────────── */
// Pop-up before payment: the names and numbers of everyone joining.
const CompanionsModal = ({ companions, onChange, error, onBack, onContinue }) => (
    <div style={overlayBackdrop}>
        <div role="dialog" aria-modal="true" aria-labelledby="companions-title" style={{
            background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #B4511E',
        }}>
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <button onClick={onBack} aria-label="Back to tour details" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'inherit', padding: 0 }}>
                    <ArrowLeft size={14} /> Back
                </button>
                <div>
                    <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 4px' }}>Your group</p>
                    <h3 id="companions-title" style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0 }}>Who's joining you?</h3>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0', lineHeight: 1.5 }}>
                        Enter the full name and contact number of each person, then continue to payment.
                    </p>
                </div>
                <CompanionFields companions={companions} onChange={onChange} error={error} />
                <button type="button" onClick={onContinue} style={{
                    width: '100%', padding: '14px 0', background: '#B4511E', color: '#FDF6EE', border: 'none', borderRadius: 16, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase',
                }}>
                    Continue to Payment
                </button>
            </div>
        </div>
    </div>
);

const CompanionFields = ({ companions, onChange, error }) => {
    const inputStyle = {
        width: '100%', boxSizing: 'border-box', background: '#FDF6EE',
        border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12,
        padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#1A0A00',
        fontFamily: 'inherit', outline: 'none',
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {companions.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#A8481A' }}>Person {i + 2}</span>
                    <input
                        aria-label={`Person ${i + 2} full name`}
                        data-allow="name"
                        placeholder="Full name"
                        value={c.full_name}
                        onChange={(e) => onChange(i, 'full_name', e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        aria-label={`Person ${i + 2} contact number`}
                        {...phoneFieldProps(c.contact_number, (v) => onChange(i, 'contact_number', v))}
                        style={inputStyle}
                    />
                </div>
            ))}
            {error && (
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#8C2F1C', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={13} /> {error}
                </p>
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────
   WAITLIST (fully booked tours)
───────────────────────────────────────────── */
const WaitlistPanel = ({ entry, bookingNumber, slots, onSlotsChange, busy, onJoin, onLeave }) => (
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bookingNumber ? (
            <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.5 }}>
                You're already booked on this tour ({bookingNumber}), so you don't need the waitlist. You can see your booking in My Bookings.
            </p>
        ) : entry ? (
            <>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.5 }}>
                    {entry.notified_at
                        ? `A slot opened up! Slots go to whoever books first, so book soon if it's still open.`
                        : `You're on the waitlist for ${entry.slots_wanted} slot${entry.slots_wanted > 1 ? 's' : ''}. We'll notify you and email you if a slot opens.`}
                </p>
                <button type="button" onClick={onLeave} disabled={busy} style={waitlistButton(false)}>
                    {busy ? 'Leaving…' : 'Leave Waitlist'}
                </button>
            </>
        ) : (
            <>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>
                    This tour is full. Join the waitlist and we'll let you know if a slot opens.
                </p>
                <PrettySelect
                    ariaLabel="Slots needed"
                    icon={Users}
                    compact
                    value={slots}
                    onChange={(v) => onSlotsChange(Number(v))}
                    options={[...Array(10)].map((_, i) => ({ value: i + 1, label: `${i + 1} ${i === 0 ? 'Person' : 'Persons'}` }))}
                />
                <button type="button" onClick={onJoin} disabled={busy} style={waitlistButton(true)}>
                    {busy ? 'Joining…' : 'Join Waitlist'}
                </button>
            </>
        )}
    </div>
);

const waitlistButton = (primary) => ({
    width: '100%', padding: '12px 0', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
    border: primary ? 'none' : '1px solid rgba(140,47,28,0.25)',
    background: primary ? '#1A0A00' : 'transparent',
    color: primary ? '#FDF6EE' : '#8C2F1C',
});

export {
  DetailedTourModal,
  TourBookingWindow,
  ProceedToPaymentModal,
  ChoosePaymentTypeModal,
  CompanionsModal,
  CompanionFields,
  WaitlistPanel,
};
