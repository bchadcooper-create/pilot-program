<?php
/**
 * Customizer: everything Chad edits lives here.
 *
 * @package DFW_Crashpads
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function dfw_sanitize_status( $value ) {
	return in_array( $value, array( 'now', 'soon', 'waitlist' ), true ) ? $value : 'now';
}

function dfw_sanitize_price( $value ) {
	return absint( $value );
}

function dfw_customize_register( $wp_customize ) {
	$panel = 'dfw_panel';
	$wp_customize->add_panel( $panel, array(
		'title'    => __( 'DFW Crashpads', 'dfw-crashpads' ),
		'priority' => 10,
	) );

	/* ---------- Contact ---------- */
	$wp_customize->add_section( 'dfw_contact', array( 'title' => __( 'Contact info', 'dfw-crashpads' ), 'panel' => $panel ) );
	dfw_text( $wp_customize, 'dfw_phone', __( 'Phone (call or text)', 'dfw-crashpads' ), '(682) 250-0979', 'dfw_contact' );
	dfw_text( $wp_customize, 'dfw_email', __( 'Email', 'dfw-crashpads' ), 'Manager@DFWCrashpads.com', 'dfw_contact', 'sanitize_email' );
	dfw_text( $wp_customize, 'dfw_facebook', __( 'Facebook page URL', 'dfw-crashpads' ), 'https://www.facebook.com/people/DFW-Crashpads/100085184194249/', 'dfw_contact', 'esc_url_raw' );

	/* ---------- Hero ---------- */
	$wp_customize->add_section( 'dfw_hero', array( 'title' => __( 'Top of homepage', 'dfw-crashpads' ), 'panel' => $panel ) );
	dfw_text( $wp_customize, 'dfw_hero_kicker', __( 'Small line above headline', 'dfw-crashpads' ), 'Crew housing 7.5 miles from DFW Airport', 'dfw_hero' );
	dfw_text( $wp_customize, 'dfw_hero_title', __( 'Headline', 'dfw-crashpads' ), 'Your own bed, minutes from DFW.', 'dfw_hero' );
	dfw_textarea( $wp_customize, 'dfw_hero_text', __( 'Paragraph under headline', 'dfw-crashpads' ), 'A quiet, clean crashpad for commuting male airline pilots and crew. Cold beds only, fresh linens provided, and a one-month minimum, then month to month.', 'dfw_hero' );
	dfw_image( $wp_customize, 'dfw_hero_image', __( 'Hero photo', 'dfw-crashpads' ), 'dfw_hero' );
	dfw_text( $wp_customize, 'dfw_meta_description', __( 'Search engine description (no city name)', 'dfw-crashpads' ), 'Clean, quiet crashpad for commuting airline pilots and crew, 7.5 miles from DFW Airport. Cold beds from $330 a month, linens provided, one-month minimum.', 'dfw_hero' );

	/* ---------- Google reviews ---------- */
	$wp_customize->add_section( 'dfw_reviews', array( 'title' => __( 'Google rating and reviews', 'dfw-crashpads' ), 'panel' => $panel ) );
	dfw_text( $wp_customize, 'dfw_google_rating', __( 'Google rating (for example 5.0)', 'dfw-crashpads' ), '5.0', 'dfw_reviews' );
	dfw_text( $wp_customize, 'dfw_google_count', __( 'Number of Google reviews', 'dfw-crashpads' ), '14', 'dfw_reviews', 'absint' );
	dfw_text( $wp_customize, 'dfw_google_url', __( 'Link to your Google reviews (optional)', 'dfw-crashpads' ), '', 'dfw_reviews', 'esc_url_raw' );
	$defaults = array(
		array( 'Hands down the best CrashPad in the DFW area! Chad\'s place is clean, well maintained, he\'s responsive, and the clients he keeps were all great to be around. Highly recommend!!!', 'Jeff L., Google review' ),
		array( 'Chad is a great crashpad owner. Clean beds, clean kitchen, clean bathrooms, and good people.', 'Alexander R., Google review' ),
		array( 'The beds are cooling memory foam. I have 3 requirements for a crashpad. 1) close to the airport 2) cold AC 3) comfortable beds. This place checks all three!', 'Trent W., crashpad guest' ),
	);
	for ( $i = 1; $i <= 3; $i++ ) {
		dfw_textarea( $wp_customize, 'dfw_review_' . $i . '_text', sprintf( __( 'Review %d text', 'dfw-crashpads' ), $i ), $defaults[ $i - 1 ][0], 'dfw_reviews' );
		dfw_text( $wp_customize, 'dfw_review_' . $i . '_name', sprintf( __( 'Review %d name', 'dfw-crashpads' ), $i ), $defaults[ $i - 1 ][1], 'dfw_reviews' );
	}

	/* ---------- Rooms, prices, availability ---------- */
	$wp_customize->add_section( 'dfw_rooms', array( 'title' => __( 'Rooms, prices, availability', 'dfw-crashpads' ), 'panel' => $panel ) );
	$rooms = array(
		'top'     => array( 'Top bunk', 330, 'Privacy curtain on every bunk. $330 in our large bunk room, $360 in a smaller room.' ),
		'bottom'  => array( 'Bottom bunk', 380, 'No climbing after a late arrival. $380 in our large bunk room, $410 in a smaller room.' ),
		'semi'    => array( 'Semi-private', 450, 'A room shared with one other crew member. No bunks.' ),
		'private' => array( 'Private', 475, 'Your own room and door. Best for reserve or long stays.' ),
	);
	foreach ( $rooms as $key => $r ) {
		dfw_text( $wp_customize, 'dfw_price_' . $key, sprintf( __( '%s: starting price', 'dfw-crashpads' ), $r[0] ), $r[1], 'dfw_rooms', 'dfw_sanitize_price' );
		dfw_text( $wp_customize, 'dfw_desc_' . $key, sprintf( __( '%s: one-line description', 'dfw-crashpads' ), $r[0] ), $r[2], 'dfw_rooms' );
		$wp_customize->add_setting( 'dfw_avail_' . $key, array( 'default' => 'now', 'sanitize_callback' => 'dfw_sanitize_status' ) );
		$wp_customize->add_control( 'dfw_avail_' . $key, array(
			'label'   => sprintf( __( '%s: availability', 'dfw-crashpads' ), $r[0] ),
			'section' => 'dfw_rooms',
			'type'    => 'select',
			'choices' => array( 'now' => 'Available now', 'soon' => 'Opening soon (add date below)', 'waitlist' => 'Waitlist' ),
		) );
		dfw_text( $wp_customize, 'dfw_avail_' . $key . '_note', sprintf( __( '%s: opening date text (for example "Opening Nov 1")', 'dfw-crashpads' ), $r[0] ), '', 'dfw_rooms' );
		dfw_image( $wp_customize, 'dfw_img_' . $key, sprintf( __( '%s: photo', 'dfw-crashpads' ), $r[0] ), 'dfw_rooms' );
	}
	dfw_text( $wp_customize, 'dfw_fee', __( 'Reservation fee amount', 'dfw-crashpads' ), 150, 'dfw_rooms', 'dfw_sanitize_price' );

	/* ---------- Amenities and gallery ---------- */
	$wp_customize->add_section( 'dfw_amenities', array( 'title' => __( "What's included and photos", 'dfw-crashpads' ), 'panel' => $panel ) );
	dfw_textarea( $wp_customize, 'dfw_amenities', __( 'Amenities, one per line', 'dfw-crashpads' ), "Wi-Fi and streaming TV\nTwo living rooms\nFull kitchen, your own pantry and fridge space\nFree washer and dryer\nIron and ironing board\nAll utilities\nWeekly professional cleaning\nParking for up to 7 cars, more on the street\nGroceries within walking distance\nBike and jogging trails nearby", 'dfw_amenities' );
	dfw_image( $wp_customize, 'dfw_gallery_1', __( 'Gallery photo 1', 'dfw-crashpads' ), 'dfw_amenities' );
	dfw_image( $wp_customize, 'dfw_gallery_2', __( 'Gallery photo 2', 'dfw-crashpads' ), 'dfw_amenities' );
	dfw_image( $wp_customize, 'dfw_gallery_3', __( 'Gallery photo 3', 'dfw-crashpads' ), 'dfw_amenities' );

	/* ---------- Apply section ---------- */
	$wp_customize->add_section( 'dfw_apply', array( 'title' => __( 'Application section', 'dfw-crashpads' ), 'panel' => $panel ) );
	dfw_textarea( $wp_customize, 'dfw_who_for', __( 'Who this pad is for', 'dfw-crashpads' ), 'Male airline pilots and crew who commute into DFW and keep a permanent home elsewhere.', 'dfw_apply' );
	dfw_textarea( $wp_customize, 'dfw_apply_intro', __( 'Text above the form', 'dfw-crashpads' ), 'We will text you within a day to set up a short call. Prefer to talk first? Call or text us.', 'dfw_apply' );

	/* ---------- Colors ---------- */
	$wp_customize->add_section( 'dfw_colors', array( 'title' => __( 'Brand colors', 'dfw-crashpads' ), 'panel' => $panel ) );
	$wp_customize->add_setting( 'dfw_brand_color', array( 'default' => '#1F4D3B', 'sanitize_callback' => 'sanitize_hex_color' ) );
	$wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'dfw_brand_color', array( 'label' => __( 'Main color', 'dfw-crashpads' ), 'section' => 'dfw_colors' ) ) );
	$wp_customize->add_setting( 'dfw_cta_color', array( 'default' => '#C2410C', 'sanitize_callback' => 'sanitize_hex_color' ) );
	$wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'dfw_cta_color', array( 'label' => __( 'Button color', 'dfw-crashpads' ), 'section' => 'dfw_colors' ) ) );
}
add_action( 'customize_register', 'dfw_customize_register' );

/* ---------- Small helpers ---------- */
function dfw_text( $wp_customize, $id, $label, $default, $section, $sanitize = 'sanitize_text_field' ) {
	$wp_customize->add_setting( $id, array( 'default' => $default, 'sanitize_callback' => $sanitize ) );
	$wp_customize->add_control( $id, array( 'label' => $label, 'section' => $section, 'type' => 'text' ) );
}
function dfw_textarea( $wp_customize, $id, $label, $default, $section ) {
	$wp_customize->add_setting( $id, array( 'default' => $default, 'sanitize_callback' => 'sanitize_textarea_field' ) );
	$wp_customize->add_control( $id, array( 'label' => $label, 'section' => $section, 'type' => 'textarea' ) );
}
function dfw_image( $wp_customize, $id, $label, $section ) {
	$wp_customize->add_setting( $id, array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
	$wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, $id, array( 'label' => $label, 'section' => $section ) ) );
}
