<?php
/**
 * DFW Crashpads theme functions.
 *
 * @package DFW_Crashpads
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DFW_THEME_VERSION', '1.2.0' );

/*
 * How wide each photo actually appears, so the browser can pick the smaller
 * copy on a phone instead of downloading the desktop one.
 * These follow the grids in style.css: the wrap is 1280px at most.
 */
define( 'DFW_HERO_SIZES',    '(max-width: 860px) calc(100vw - 40px), 600px' );
define( 'DFW_ROOM_SIZES',    '(max-width: 860px) 110px, 310px' );
define( 'DFW_GALLERY_SIZES', '(max-width: 860px) calc(50vw - 26px), 410px' );

require_once get_template_directory() . '/inc/customizer.php';

/**
 * Defaults shared by the Customizer and the templates, so the site looks right before anything is saved.
 */
function dfw_defaults() {
	static $d = null;
	if ( null === $d ) {
		$d = array(
			'dfw_phone' => '(682) 250-0979',
			'dfw_email' => 'Manager@DFWCrashpads.com',
			'dfw_facebook' => 'https://www.facebook.com/people/DFW-Crashpads/100085184194249/',
			'dfw_hero_kicker' => 'Crew housing 7.5 miles from DFW Airport',
			'dfw_hero_title' => 'Your own bed, minutes from DFW.',
			'dfw_hero_text' => 'A quiet, clean crashpad for commuting male airline pilots and crew. Cold beds only, fresh linens provided, and a one-month minimum, then month to month.',
			'dfw_meta_description' => 'Clean, quiet crashpad for commuting airline pilots and crew, 7.5 miles from DFW Airport. Cold beds from $330 a month, linens provided, one-month minimum.',
			'dfw_google_rating' => '5.0',
			'dfw_google_count' => 14,
			'dfw_google_url' => '',
			'dfw_review_1_text' => 'Hands down the best CrashPad in the DFW area! Chad\'s place is clean, well maintained, he\'s responsive, and the clients he keeps were all great to be around. Highly recommend!!!',
			'dfw_review_1_name' => 'Jeff L., Google review',
			'dfw_review_2_text' => 'Chad is a great crashpad owner. Clean beds, clean kitchen, clean bathrooms, and good people.',
			'dfw_review_2_name' => 'Alexander R., Google review',
			'dfw_review_3_text' => 'The beds are cooling memory foam. I have 3 requirements for a crashpad. 1) close to the airport 2) cold AC 3) comfortable beds. This place checks all three!',
			'dfw_review_3_name' => 'Trent W., crashpad guest',
			'dfw_price_top' => 330, 'dfw_price_bottom' => 380, 'dfw_price_semi' => 450, 'dfw_price_private' => 475,
			'dfw_desc_top' => 'Privacy curtain on every bunk. $330 in our large bunk room, $360 in a smaller room.',
			'dfw_desc_bottom' => 'No climbing after a late arrival. $380 in our large bunk room, $410 in a smaller room.',
			'dfw_desc_semi' => 'A room shared with one other crew member. No bunks.',
			'dfw_desc_private' => 'Your own room and door. Best for reserve or long stays.',
			'dfw_avail_top' => 'now', 'dfw_avail_bottom' => 'now', 'dfw_avail_semi' => 'now', 'dfw_avail_private' => 'now',
			'dfw_fee' => 150,
			'dfw_amenities' => "Wi-Fi and streaming TV\nTwo living rooms\nFull kitchen, your own pantry and fridge space\nFree washer and dryer\nIron and ironing board\nAll utilities\nWeekly professional cleaning\nParking for up to 7 cars, more on the street\nGroceries within walking distance\nBike and jogging trails nearby",
			'dfw_who_for' => 'Male airline pilots and crew who commute into DFW and keep a permanent home elsewhere.',
			'dfw_apply_intro' => 'We will text you within a day to set up a short call. Prefer to talk first? Call or text us.',
			'dfw_brand_color' => '#1F4D3B',
			'dfw_cta_color' => '#C2410C',
		);
	}
	return $d;
}

/**
 * Read a Customizer value with its shared default.
 */
function dfw_mod( $id ) {
	$d = dfw_defaults();
	return get_theme_mod( $id, isset( $d[ $id ] ) ? $d[ $id ] : '' );
}


/**
 * Theme setup.
 */
function dfw_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'align-wide' );
	add_theme_support( 'custom-logo', array( 'height' => 80, 'width' => 300, 'flex-width' => true ) );
	register_nav_menus( array( 'primary' => __( 'Header menu', 'dfw-crashpads' ), 'footer' => __( 'Footer menu', 'dfw-crashpads' ) ) );
}
add_action( 'after_setup_theme', 'dfw_setup' );

/**
 * Styles and scripts.
 */
function dfw_assets() {
	wp_enqueue_style( 'dfw-style', get_stylesheet_uri(), array(), DFW_THEME_VERSION );
	wp_add_inline_style( 'dfw-style', dfw_color_css() );
	wp_enqueue_script( 'dfw-main', get_template_directory_uri() . '/assets/js/main.js', array(), DFW_THEME_VERSION, true );
}
add_action( 'wp_enqueue_scripts', 'dfw_assets' );

/**
 * Print the stylesheet into the page instead of fetching it.
 *
 * The whole theme is about 13 KB of CSS, and a browser will not draw anything
 * until it has arrived. On a phone that was a second of blank screen waiting
 * for one small file. Printed into the <head> it costs roughly 5 KB of the
 * page's own (already compressed) download and no round trip at all.
 *
 * Turn it back into a normal file with:
 *   add_filter( 'dfw_inline_css', '__return_false' );
 */
function dfw_inline_stylesheet() {
	if ( is_admin() || is_customize_preview() || ! apply_filters( 'dfw_inline_css', true ) ) {
		return;
	}
	$file = get_template_directory() . '/style.css';
	if ( ! file_exists( $file ) || filesize( $file ) > 60000 ) {
		return;
	}
	$css = dfw_minify_css( (string) file_get_contents( $file ) );
	if ( '' === $css ) {
		return;
	}
	wp_dequeue_style( 'dfw-style' );
	echo '<style id="dfw-style-inline">' . $css . dfw_color_css() . "</style>\n";
}
add_action( 'wp_head', 'dfw_inline_stylesheet', 3 );

/**
 * Comments and spare whitespace out. Deliberately cautious: it leaves the
 * insides of values alone, so nothing can be mangled by a clever rule.
 */
function dfw_minify_css( $css ) {
	$css = preg_replace( '#/\*(?!!)[\s\S]*?\*/#', '', $css );          // comments
	$css = preg_replace( '/\s*\R\s*/', ' ', $css );                     // newlines
	$css = preg_replace( '/\s{2,}/', ' ', $css );                       // runs of spaces
	// Only around characters that can never be part of a value. Combinators
	// (> ~ +) are left alone on purpose: the same symbols appear inside calc().
	$css = preg_replace( '/\s*([{};,])\s*/', '$1', $css );
	$css = preg_replace( '/:\s+/', ':', $css );
	$css = str_replace( ';}', '}', $css );
	return trim( $css );
}

/**
 * Fonts, served from this site rather than from Google.
 *
 * Google served five files from a second domain, which meant a DNS lookup and
 * a TLS handshake to fonts.gstatic.com before a single letter could be drawn,
 * plus a stylesheet request to fonts.googleapis.com in front of that.
 *
 * These two files are the same typefaces as variable fonts, cut down to the
 * Latin characters the site uses. Two files, on this domain, on a connection
 * the browser has already opened. The @font-face rules are printed into the
 * page rather than fetched, so nothing blocks on them.
 */
function dfw_font_files() {
	$base = get_template_directory_uri() . '/assets/fonts/';
	return array(
		'Public Sans'       => $base . 'public-sans.woff2',
		'Libre Baskerville' => $base . 'libre-baskerville.woff2',
	);
}

function dfw_font_face_css() {
	$out = '';
	foreach ( dfw_font_files() as $family => $url ) {
		$out .= "@font-face{font-family:'" . $family . "';font-style:normal;font-weight:400 700;font-display:swap;src:url('" . esc_url( $url ) . "') format('woff2-variations'),url('" . esc_url( $url ) . "') format('woff2');}";
	}
	return $out;
}

/** Preload both faces and print the @font-face rules, as early in the head as possible. */
function dfw_font_head() {
	foreach ( dfw_font_files() as $url ) {
		echo '<link rel="preload" href="' . esc_url( $url ) . '" as="font" type="font/woff2" crossorigin>' . "\n";
	}
	echo '<style id="dfw-fonts">' . dfw_font_face_css() . "</style>\n";
}
add_action( 'wp_head', 'dfw_font_head', 1 );

/**
 * Nothing to preconnect to any more: the fonts are on this domain.
 * Strip the hints WordPress and other plugins add for Google Fonts so the
 * browser does not open two connections it will never use.
 */
function dfw_resource_hints( $urls, $relation_type ) {
	if ( 'preconnect' !== $relation_type && 'dns-prefetch' !== $relation_type ) {
		return $urls;
	}
	return array_values( array_filter( $urls, function ( $u ) {
		$href = is_array( $u ) ? ( isset( $u['href'] ) ? $u['href'] : '' ) : $u;
		return false === strpos( $href, 'fonts.googleapis.com' ) && false === strpos( $href, 'fonts.gstatic.com' );
	} ) );
}
add_filter( 'wp_resource_hints', 'dfw_resource_hints', 20, 2 );

/**
 * One icon link instead of three.
 *
 * WordPress prints the same icon file three times with different "sizes"
 * attributes. Browsers treat those as three separate icons and fetch the file
 * more than once, which showed up as duplicate requests in the speed test.
 * One link, plus the Apple one, is all any browser needs.
 */
function dfw_one_site_icon( $tags ) {
	$out      = array();
	$have_ico = false;
	foreach ( (array) $tags as $tag ) {
		$is_icon = ( false !== strpos( $tag, 'rel="icon"' ) );
		if ( ! $is_icon ) {
			$out[] = $tag; // apple-touch-icon, msapplication-TileImage and friends.
			continue;
		}
		if ( $have_ico ) {
			continue; // The same file again at another size. Skip it.
		}
		$have_ico = true;
		$out[]    = preg_replace( '/\s*sizes="[^"]*"/', '', $tag );
	}
	return $out;
}
add_filter( 'site_icon_meta_tags', 'dfw_one_site_icon' );

/**
 * Brand colors from the Customizer.
 */
function dfw_color_css() {
	$brand = sanitize_hex_color( dfw_mod( 'dfw_brand_color' ) );
	$cta   = sanitize_hex_color( dfw_mod( 'dfw_cta_color' ) );
	if ( ! $brand ) {
		$brand = '#1F4D3B';
	}
	if ( ! $cta ) {
		$cta = '#C2410C';
	}
	return ':root{--brand:' . $brand . ';--brand-dark:' . dfw_darken( $brand ) . ';--tint-ink:' . $brand . ';--cta:' . $cta . ';--cta-dark:' . dfw_darken( $cta ) . ';}';
}

/**
 * Darken a hex color by roughly 18 percent for hover states.
 */
function dfw_darken( $hex ) {
	$hex = ltrim( $hex, '#' );
	if ( 3 === strlen( $hex ) ) {
		$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
	}
	$out = '#';
	for ( $i = 0; $i < 3; $i++ ) {
		$c    = hexdec( substr( $hex, $i * 2, 2 ) );
		$c    = max( 0, (int) round( $c * 0.82 ) );
		$out .= str_pad( dechex( $c ), 2, '0', STR_PAD_LEFT );
	}
	return $out;
}

/**
 * Phone helpers.
 */
function dfw_phone_display() {
	return dfw_mod( 'dfw_phone' );
}
function dfw_phone_link() {
	$digits = preg_replace( '/\D+/', '', dfw_phone_display() );
	if ( 10 === strlen( $digits ) ) {
		$digits = '1' . $digits;
	}
	return 'tel:+' . $digits;
}
function dfw_sms_link() {
	return str_replace( 'tel:', 'sms:', dfw_phone_link() );
}


/**
 * Contact links that bots cannot scrape. The real number is base64 in a data attribute and
 * assembled by JavaScript in the browser. Scrapers that do not run JavaScript see no digits.
 *
 * @param string $kind  'tel', 'sms', or 'mail'.
 * @param string $label Text to show. Use '' to show the number or address itself.
 * @param string $class Extra CSS classes.
 */
function dfw_contact_link( $kind = 'tel', $label = '', $class = '' ) {
	if ( 'mail' === $kind ) {
		$target  = 'mailto:' . dfw_mod( 'dfw_email' );
		$visible = $label ? $label : dfw_mod( 'dfw_email' );
	} else {
		$target  = ( 'sms' === $kind ? dfw_sms_link() : dfw_phone_link() );
		$visible = $label ? $label : dfw_phone_display();
	}
	// What non-JavaScript visitors (and scrapers) see: the label with the number or address removed.
	$fallback = $label ? str_replace( array( dfw_phone_display(), dfw_mod( 'dfw_email' ) ), 'us', $label ) : ( 'mail' === $kind ? __( 'Email us', 'dfw-crashpads' ) : __( 'Call or text us', 'dfw-crashpads' ) );
	return '<a class="dfw-c ' . esc_attr( $class ) . '" href="#contact" data-h="' . esc_attr( base64_encode( $target ) ) . '" data-t="' . esc_attr( base64_encode( $visible ) ) . '">' . esc_html( $fallback ) . '</a>';
}

/**
 * Image helper: Customizer image or bundled default.
 */
/** Just the URL of a customizer image (or our bundled default), for schema and social tags. */
function dfw_img_url( $mod, $default_file ) {
	$url = get_theme_mod( $mod );
	return $url ? $url : get_template_directory_uri() . '/assets/img/' . $default_file;
}

function dfw_img( $mod, $default_file, $alt = '', $args = array() ) {
	$url = get_theme_mod( $mod );
	if ( ! $url ) {
		$url = get_template_directory_uri() . '/assets/img/' . $default_file;
	}
	return dfw_picture( $url, $alt, $args );
}

/**
 * An <img>, wrapped in <picture> with a WebP source when we ship one.
 *
 * WebP is roughly a third the size of the same JPEG. Browsers that do not
 * understand it fall through to the <img> and get the JPEG, so there is no
 * downside. Only our own bundled photos have WebP siblings; a photo uploaded
 * through the Customizer is served as-is.
 *
 * $args: style, priority (true for the hero, which must not be lazy-loaded
 * because it is the largest thing on the screen), width, height.
 */
function dfw_picture( $url, $alt = '', $args = array() ) {
	$args = wp_parse_args( $args, array(
		'style'    => '',
		'priority' => false,
		'width'    => 0,
		'height'   => 0,
		'sizes'    => '',   // What width this image actually occupies, per screen size.
	) );

	$attr = ' alt="' . esc_attr( $alt ) . '" decoding="async"';
	if ( $args['style'] ) {
		$attr .= ' style="' . esc_attr( $args['style'] ) . '"';
	}
	if ( $args['width'] && $args['height'] ) {
		$attr .= ' width="' . (int) $args['width'] . '" height="' . (int) $args['height'] . '"';
	}
	// The hero is the Largest Contentful Paint. Lazy-loading it delays the
	// whole page score; fetchpriority tells the browser to start it first.
	$attr .= $args['priority'] ? ' fetchpriority="high"' : ' loading="lazy"';

	$set = dfw_srcset_for( $url, $args['width'] );
	if ( $set && $args['sizes'] ) {
		$attr .= ' srcset="' . esc_attr( $set['jpg'] ) . '" sizes="' . esc_attr( $args['sizes'] ) . '"';
	}

	$img = '<img src="' . esc_url( $url ) . '"' . $attr . '>';

	$webp = dfw_webp_for( $url );
	if ( ! $webp ) {
		return $img;
	}
	$source = '<source type="image/webp" srcset="';
	if ( $set && $args['sizes'] ) {
		$source .= esc_attr( $set['webp'] ) . '" sizes="' . esc_attr( $args['sizes'] );
	} else {
		$source .= esc_url( $webp );
	}
	return '<picture>' . $source . '">' . $img . '</picture>';
}

/**
 * A phone-sized copy of a bundled theme photo, where one exists.
 *
 * The homepage showed a 1000px wide photo in a 372px wide slot on a phone,
 * which is most of a megabyte of detail nobody can see. Each photo has a
 * smaller "-sm" twin; this hands the browser both and lets it pick.
 *
 * @return array|false  {jpg, webp} srcset strings, or false if there is no small copy.
 */
function dfw_srcset_for( $url, $full_width ) {
	$base = get_template_directory_uri() . '/assets/img/';
	$dir  = get_template_directory() . '/assets/img/';
	if ( 0 !== strpos( $url, $base ) || ! $full_width ) {
		return false;   // A Customizer upload: WordPress handles its own sizes.
	}
	$file = substr( $url, strlen( $base ) );
	if ( ! preg_match( '/^(.+)\.(jpe?g|png)$/i', $file, $m ) ) {
		return false;
	}
	$stem = $m[1];
	if ( ! file_exists( $dir . $stem . '-sm.jpg' ) ) {
		return false;
	}
	// Width of the small copy, read from the file rather than assumed.
	$size = @getimagesize( $dir . $stem . '-sm.jpg' );
	if ( ! $size || ! $size[0] ) {
		return false;
	}
	$sw = (int) $size[0];

	$jpg  = $base . $stem . '-sm.jpg ' . $sw . 'w, ' . $url . ' ' . (int) $full_width . 'w';
	$webp = '';
	if ( file_exists( $dir . $stem . '-sm.webp' ) && file_exists( $dir . $stem . '.webp' ) ) {
		$webp = $base . $stem . '-sm.webp ' . $sw . 'w, ' . $base . $stem . '.webp ' . (int) $full_width . 'w';
	}
	return array( 'jpg' => $jpg, 'webp' => $webp ? $webp : $jpg );
}

/** The WebP sibling of a bundled theme image, if the file is really there. */
function dfw_webp_for( $url ) {
	$base = get_template_directory_uri() . '/assets/img/';
	if ( 0 !== strpos( $url, $base ) ) {
		return '';
	}
	$file = substr( $url, strlen( $base ) );
	$webp = preg_replace( '/\.(jpe?g|png)$/i', '.webp', $file );
	if ( $webp === $file ) {
		return '';
	}
	if ( ! file_exists( get_template_directory() . '/assets/img/' . $webp ) ) {
		return '';
	}
	return $base . $webp;
}

/**
 * Start the hero photo downloading before the stylesheet has even parsed.
 * imagesrcset matches what the <picture> will choose, so the phone preloads
 * the phone-sized copy rather than the desktop one.
 */
function dfw_preload_hero() {
	if ( ! is_front_page() ) {
		return;
	}
	$url  = get_theme_mod( 'dfw_hero_image' );
	$url  = $url ? $url : get_template_directory_uri() . '/assets/img/living-kitchen.jpg';
	$webp = dfw_webp_for( $url );
	$set  = dfw_srcset_for( $url, 1000 );
	$href = $webp ? $webp : $url;

	echo '<link rel="preload" as="image" href="' . esc_url( $href ) . '"';
	if ( $webp ) {
		echo ' type="image/webp"';
	}
	if ( $set ) {
		echo ' imagesrcset="' . esc_attr( $webp ? $set['webp'] : $set['jpg'] ) . '" imagesizes="' . esc_attr( DFW_HERO_SIZES ) . '"';
	}
	echo ' fetchpriority="high">' . "\n";
}
add_action( 'wp_head', 'dfw_preload_hero', 2 );

/**
 * Five stars as inline SVG.
 */
function dfw_stars() {
	$star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"></path></svg>';
	return '<span class="stars" role="img" aria-label="5 out of 5 stars">' . str_repeat( $star, 5 ) . '</span>';
}

/**
 * Availability pill for a room category.
 */
function dfw_availability_pill( $key ) {
	$status = dfw_mod( 'dfw_avail_' . $key );
	$note   = dfw_mod( 'dfw_avail_' . $key . '_note' );
	$labels = array(
		'now'      => __( 'Available now', 'dfw-crashpads' ),
		'soon'     => $note ? $note : __( 'Opening soon', 'dfw-crashpads' ),
		'waitlist' => __( 'Waitlist', 'dfw-crashpads' ),
	);
	$class  = array( 'now' => 'pill', 'soon' => 'pill pill-soon', 'waitlist' => 'pill pill-wait' );
	if ( ! isset( $labels[ $status ] ) ) {
		$status = 'now';
	}
	return '<span class="' . esc_attr( $class[ $status ] ) . '">' . esc_html( $labels[ $status ] ) . '</span>';
}

/**
 * Meta description for the front page and pages. Never includes the city.
 */
function dfw_meta_description() {
	if ( defined( 'WPSEO_VERSION' ) ) {
		return; // Yoast prints the tag, using our text (see dfw_yoast_description).
	}
	if ( is_front_page() ) {
		$desc = dfw_mod( 'dfw_meta_description' );
	} elseif ( is_singular() ) {
		$desc = get_the_excerpt();
	} else {
		return;
	}
	if ( $desc ) {
		echo '<meta name="description" content="' . esc_attr( wp_strip_all_tags( $desc ) ) . '">' . "\n";
	}
}
add_action( 'wp_head', 'dfw_meta_description', 1 );

/**
 * The quick answers, in one place: the homepage FAQ section and the FAQPage
 * schema both read from here, so they can never drift apart.
 */
function dfw_faq_items() {
	return array(
		array( __( 'Where is it?', 'dfw-crashpads' ), __( 'A house 7.5 miles from DFW Airport. The exact address is shared once you are approved.', 'dfw-crashpads' ) ),
		array( __( 'What is a cold bed?', 'dfw-crashpads' ), __( 'A bed that is only yours for your whole stay. We do not do hot beds.', 'dfw-crashpads' ) ),
		array( __( 'Is there a long commitment?', 'dfw-crashpads' ), __( 'No. Some crashpads ask for 2 to 3 months up front. We ask for one month, then it is month to month. Your bed is yours all month, whether your schedule has you here a few nights or every night.', 'dfw-crashpads' ) ),
		array( __( 'How much does a crashpad near DFW cost?', 'dfw-crashpads' ), __( 'Top bunks start at $330 a month and bottom bunks at $380, with semi-private and private rooms from $450. Every price includes utilities, Wi-Fi, linens, weekly cleaning, and parking.', 'dfw-crashpads' ) ),
		array( __( 'Can I bring my car?', 'dfw-crashpads' ), __( 'Yes. There is room for up to 7 cars at the house, and more on the street.', 'dfw-crashpads' ) ),
		array( __( 'Do I bring bedding?', 'dfw-crashpads' ), __( 'No. Pillow, sheets, blanket, and towel are provided.', 'dfw-crashpads' ) ),
		array( __( 'How do I pay?', 'dfw-crashpads' ), __( 'Zelle, Apple Pay, Venmo, PayPal, or Cash App. Rent is due on the 1st.', 'dfw-crashpads' ) ),
		array( __( 'How fast can I move in?', 'dfw-crashpads' ), __( 'Usually within a day or two of applying: a short phone call, sign online, pay the $150 reservation fee, and your door code is on your phone before your next trip.', 'dfw-crashpads' ) ),
	);
}

/**
 * Structured data: the business (phone only, never an address) and the FAQ,
 * so Google can show the quick answers under the listing.
 */
function dfw_schema() {
	if ( ! is_front_page() ) {
		return;
	}
	$prices = array();
	foreach ( array( 'top', 'bottom', 'semi', 'private' ) as $k ) {
		$p = (int) dfw_mod( 'dfw_price_' . $k );
		if ( $p ) { $prices[] = $p; }
	}
	$business = array(
		'@context'    => 'https://schema.org',
		'@type'       => 'LodgingBusiness',
		'@id'         => home_url( '/#business' ),
		'name'        => get_bloginfo( 'name' ),
		'url'         => home_url( '/' ),
		'description' => dfw_mod( 'dfw_meta_description' ),
		'image'       => dfw_img_url( 'dfw_hero_image', 'living-kitchen.jpg' ),
		'priceRange'  => $prices ? '$' . min( $prices ) . ' - $' . max( $prices ) . ' per month' : '$$',
		'audience'    => array( '@type' => 'Audience', 'audienceType' => 'Commuting airline pilots and crew' ),
		'amenityFeature' => array(
			array( '@type' => 'LocationFeatureSpecification', 'name' => 'Free Wi-Fi', 'value' => true ),
			array( '@type' => 'LocationFeatureSpecification', 'name' => 'Free parking', 'value' => true ),
			array( '@type' => 'LocationFeatureSpecification', 'name' => 'Weekly housekeeping', 'value' => true ),
			array( '@type' => 'LocationFeatureSpecification', 'name' => 'Linens provided', 'value' => true ),
			array( '@type' => 'LocationFeatureSpecification', 'name' => 'Keyless entry', 'value' => true ),
		),
	);
	$faq = array( '@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array() );
	foreach ( dfw_faq_items() as $qa ) {
		$faq['mainEntity'][] = array( '@type' => 'Question', 'name' => $qa[0], 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $qa[1] ) );
	}
	echo '<script type="application/ld+json">' . wp_json_encode( $business, JSON_UNESCAPED_SLASHES ) . '</script>' . "\n";
	echo '<script type="application/ld+json">' . wp_json_encode( $faq, JSON_UNESCAPED_SLASHES ) . '</script>' . "\n";
}
add_action( 'wp_head', 'dfw_schema' );

/**
 * Yoast prints its own description and social tags from the site tagline,
 * which put a second, weaker description on the homepage. Hand it ours.
 */
function dfw_yoast_description( $desc ) {
	if ( is_front_page() ) {
		$ours = dfw_mod( 'dfw_meta_description' );
		if ( $ours ) { return wp_strip_all_tags( $ours ); }
	}
	return $desc;
}
add_filter( 'wpseo_metadesc', 'dfw_yoast_description', 20 );
add_filter( 'wpseo_opengraph_desc', 'dfw_yoast_description', 20 );
add_filter( 'wpseo_twitter_description', 'dfw_yoast_description', 20 );

/**
 * Keep the signing page and thank-you page out of search results.
 */
function dfw_noindex_private_pages() {
	if ( is_page( array( 'sign', 'thank-you', 'apply-thank-you' ) ) ) {
		echo '<meta name="robots" content="noindex, nofollow">' . "\n";
	}
}
add_action( 'wp_head', 'dfw_noindex_private_pages' );

/**
 * Fallback header menu when no menu is assigned.
 */
function dfw_fallback_menu() {
	$home = home_url( '/' );
	echo '<a href="' . esc_url( $home . '#rooms' ) . '">' . esc_html__( 'Rooms & Pricing', 'dfw-crashpads' ) . '</a>';
	echo '<a href="' . esc_url( $home . '#amenities' ) . '">' . esc_html__( "What's Included", 'dfw-crashpads' ) . '</a>';
	echo '<a href="' . esc_url( $home . '#faq' ) . '">' . esc_html__( 'FAQ', 'dfw-crashpads' ) . '</a>';
}

/**
 * Remove the WordPress version from the head for a little privacy.
 */
remove_action( 'wp_head', 'wp_generator' );

/**
 * Menu walker that outputs plain links (no <ul>/<li>) to match the header layout.
 */
class DFW_Link_Walker extends Walker_Nav_Menu {
	public function start_lvl( &$output, $depth = 0, $args = null ) {}
	public function end_lvl( &$output, $depth = 0, $args = null ) {}
	public function start_el( &$output, $item, $depth = 0, $args = null, $id = 0 ) {
		$output .= '<a href="' . esc_url( $item->url ) . '">' . esc_html( $item->title ) . '</a>';
	}
	public function end_el( &$output, $item, $depth = 0, $args = null ) {}
}
