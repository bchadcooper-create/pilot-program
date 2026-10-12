<?php
/**
 * Plugin Name: DFW Crashpads Core
 * Description: Application form, lead storage, e-signed agreements, email and Google Sheet notifications, availability API for the phone app, and photo privacy (strips hidden location data from uploads). Companion to the DFW Crashpads theme.
 * Version: 1.7.1
 * Author: DFW Crashpads, LLC
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: dfw-crashpads-core
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DFW_CORE_VERSION', '1.0.0' );

/* =========================================================
 * 1. Leads: a private post type that stores every application
 * ======================================================= */
function dfw_core_register_lead_type() {
	register_post_type( 'dfw_lead', array(
		'labels' => array(
			'name'          => __( 'Applications', 'dfw-crashpads-core' ),
			'singular_name' => __( 'Application', 'dfw-crashpads-core' ),
			'menu_name'     => __( 'Applications', 'dfw-crashpads-core' ),
			'edit_item'     => __( 'View application', 'dfw-crashpads-core' ),
		),
		'public'              => false,
		'show_ui'             => true,
		'show_in_menu'        => true,
		'exclude_from_search' => true,
		'publicly_queryable'  => false,
		'show_in_rest'        => false,
		'menu_icon'           => 'dashicons-clipboard',
		'menu_position'       => 21,
		'supports'            => array( 'title' ),
		'capability_type'     => 'post',
		'map_meta_cap'        => true,
	) );
}
add_action( 'init', 'dfw_core_register_lead_type' );

require_once __DIR__ . '/includes/agreements.php';
require_once __DIR__ . '/includes/speed.php';

/* =========================================================
 * Every email the site sends comes from DFW Crashpads,
 * not "WordPress <wordpress@...>".
 * ======================================================= */
function dfw_core_mail_from( $from ) {
	$custom = get_option( 'dfw_core_mail_from' );
	if ( $custom && is_email( $custom ) ) {
		return $custom;
	}
	// Only replace WordPress's generic default; leave SMTP plugins alone.
	if ( 0 === strpos( $from, 'wordpress@' ) ) {
		return 'manager@' . preg_replace( '/^www\./', '', wp_parse_url( home_url(), PHP_URL_HOST ) );
	}
	return $from;
}
add_filter( 'wp_mail_from', 'dfw_core_mail_from' );

function dfw_core_mail_from_name( $name ) {
	$custom = get_option( 'dfw_core_mail_from_name' );
	if ( $custom ) {
		return $custom;
	}
	return ( 'WordPress' === $name || '' === $name ) ? 'DFW Crashpads' : $name;
}
add_filter( 'wp_mail_from_name', 'dfw_core_mail_from_name' );

$GLOBALS['dfw_core_fields'] = array(
	'name'     => 'Full name',
	'email'    => 'Email',
	'phone'    => 'Mobile phone',
	'airline'  => 'Airline',
	'position' => 'Position',
	'sex'      => 'Sex',
	'start'    => 'Move-in date',
	'bed'      => 'Bed preference',
	'source'   => 'How they found us',
	'notes'    => 'Notes',
);

/* Show the application details in the admin. */
function dfw_core_lead_meta_box() {
	add_meta_box( 'dfw_lead_details', __( 'Application details', 'dfw-crashpads-core' ), 'dfw_core_lead_meta_box_html', 'dfw_lead', 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'dfw_core_lead_meta_box' );

function dfw_core_lead_meta_box_html( $post ) {
	echo '<table class="widefat striped">';
	foreach ( $GLOBALS['dfw_core_fields'] as $key => $label ) {
		$value = get_post_meta( $post->ID, 'dfw_' . $key, true );
		if ( 'phone' === $key && $value ) {
			$digits = preg_replace( '/\D+/', '', $value );
			$value  = '<a href="sms:+1' . esc_attr( dfw_sms_digits( $digits ) ) . '">' . esc_html( $value ) . '</a> (tap to text)';
		} elseif ( 'email' === $key && $value ) {
			$value = '<a href="mailto:' . esc_attr( $value ) . '">' . esc_html( $value ) . '</a>';
		} else {
			$value = nl2br( esc_html( $value ) );
		}
		echo '<tr><th style="width:160px">' . esc_html( $label ) . '</th><td>' . $value . '</td></tr>';
	}
	echo '<tr><th>Submitted</th><td>' . esc_html( get_the_date( 'M j, Y g:i a', $post ) ) . '</td></tr>';
	echo '<tr><th>Sheet sync</th><td>' . esc_html( get_post_meta( $post->ID, 'dfw_webhook_status', true ) ?: 'Not configured' ) . '</td></tr>';
	echo '</table>';
}

function dfw_core_lead_columns( $columns ) {
	return array(
		'cb'       => $columns['cb'],
		'title'    => __( 'Name', 'dfw-crashpads-core' ),
		'airline'  => __( 'Airline', 'dfw-crashpads-core' ),
		'position' => __( 'Position', 'dfw-crashpads-core' ),
		'start'    => __( 'Move-in', 'dfw-crashpads-core' ),
		'phone'    => __( 'Phone', 'dfw-crashpads-core' ),
		'date'     => __( 'Applied', 'dfw-crashpads-core' ),
	);
}
add_filter( 'manage_dfw_lead_posts_columns', 'dfw_core_lead_columns' );

function dfw_core_lead_column_values( $column, $post_id ) {
	if ( in_array( $column, array( 'airline', 'position', 'start', 'phone' ), true ) ) {
		echo esc_html( get_post_meta( $post_id, 'dfw_' . $column, true ) );
	}
}
add_action( 'manage_dfw_lead_posts_custom_column', 'dfw_core_lead_column_values', 10, 2 );

/* =========================================================
 * 2. Settings page: Settings > DFW Crashpads
 * ======================================================= */
function dfw_core_settings_menu() {
	add_options_page( 'DFW Crashpads', 'DFW Crashpads', 'manage_options', 'dfw-crashpads', 'dfw_core_settings_page' );
}
add_action( 'admin_menu', 'dfw_core_settings_menu' );

function dfw_core_register_settings() {
	register_setting( 'dfw_core', 'dfw_core_notify_email', array( 'sanitize_callback' => 'sanitize_email' ) );
	register_setting( 'dfw_core', 'dfw_core_webhook_url', array( 'sanitize_callback' => 'esc_url_raw' ) );
	register_setting( 'dfw_core', 'dfw_core_api_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_core_thankyou_page', array( 'sanitize_callback' => 'absint' ) );
	register_setting( 'dfw_core', 'dfw_core_mail_from_name', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_core_mail_from', array( 'sanitize_callback' => 'sanitize_email' ) );
	register_setting( 'dfw_core', 'dfw_core_turnstile_site', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_core_turnstile_secret', array( 'sanitize_callback' => 'sanitize_text_field' ) );
}
add_action( 'admin_init', 'dfw_core_register_settings' );

function dfw_core_settings_page() {
	if ( ! get_option( 'dfw_core_api_key' ) ) {
		update_option( 'dfw_core_api_key', wp_generate_password( 32, false ) );
	}
	?>
	<div class="wrap">
		<h1>DFW Crashpads</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'dfw_core' ); ?>
			<table class="form-table">
				<tr>
					<th><label for="dfw_core_notify_email">Send new applications to</label></th>
					<td><input type="email" class="regular-text" id="dfw_core_notify_email" name="dfw_core_notify_email" value="<?php echo esc_attr( get_option( 'dfw_core_notify_email', get_option( 'admin_email' ) ) ); ?>"></td>
				</tr>
				<tr>
					<th><label for="dfw_core_webhook_url">Google Sheet webhook URL</label></th>
					<td><input type="url" class="regular-text" id="dfw_core_webhook_url" name="dfw_core_webhook_url" value="<?php echo esc_attr( get_option( 'dfw_core_webhook_url' ) ); ?>"><p class="description">Optional. The Apps Script web app URL that adds each application to the Leads tab of your tracker. Leave blank until that is set up.</p></td>
				</tr>
				<tr>
					<th><label for="dfw_core_thankyou_page">Thank-you page</label></th>
					<td><?php wp_dropdown_pages( array( 'name' => 'dfw_core_thankyou_page', 'id' => 'dfw_core_thankyou_page', 'selected' => (int) get_option( 'dfw_core_thankyou_page' ), 'show_option_none' => 'Stay on the homepage', 'option_none_value' => 0 ) ); ?></td>
				</tr>
				<tr>
					<th><label for="dfw_core_mail_from_name">Emails come from</label></th>
					<td><input type="text" id="dfw_core_mail_from_name" name="dfw_core_mail_from_name" class="regular-text" value="<?php echo esc_attr( get_option( 'dfw_core_mail_from_name', 'DFW Crashpads' ) ); ?>" placeholder="DFW Crashpads">
					&lt;<input type="email" name="dfw_core_mail_from" class="regular-text" style="width:260px" value="<?php echo esc_attr( get_option( 'dfw_core_mail_from', 'manager@dfwcrashpads.com' ) ); ?>" placeholder="manager@dfwcrashpads.com">&gt;
					<p class="description">The name and address guests see on every email from the site. Use an address at dfwcrashpads.com so mail is not flagged as spam.</p></td>
				</tr>
				<tr>
					<th><label for="dfw_core_turnstile_site">Bot protection (Cloudflare Turnstile)</label></th>
					<td><input type="text" class="regular-text" id="dfw_core_turnstile_site" name="dfw_core_turnstile_site" value="<?php echo esc_attr( get_option( 'dfw_core_turnstile_site' ) ); ?>" placeholder="Site key"><br><input type="text" class="regular-text" style="margin-top:6px" name="dfw_core_turnstile_secret" value="<?php echo esc_attr( get_option( 'dfw_core_turnstile_secret' ) ); ?>" placeholder="Secret key"><p class="description">Optional but recommended. Create a free Turnstile widget at dash.cloudflare.com (Turnstile > Add widget, hostname dfwcrashpads.com, widget mode Managed) and paste both keys. The form already has a honeypot and a timing check; Turnstile adds a proper bot check that most people never even see.</p></td>
				</tr>
				<tr>
					<th>Availability API key</th>
					<td><code><?php echo esc_html( get_option( 'dfw_core_api_key' ) ); ?></code><p class="description">The phone app and tracker use this key to update the availability pills on the homepage. Keep it private. Endpoint: <code><?php echo esc_html( rest_url( 'dfw/v1/availability' ) ); ?></code></p></td>
				</tr>
			<?php do_action( 'dfw_core_settings_rows' ); ?>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* =========================================================
 * 3. The application form
 * ======================================================= */
function dfw_core_form_shortcode() {
	$errors = isset( $GLOBALS['dfw_core_errors'] ) ? $GLOBALS['dfw_core_errors'] : array();
	$old    = isset( $GLOBALS['dfw_core_old'] ) ? $GLOBALS['dfw_core_old'] : array();
	$v      = function ( $key ) use ( $old ) { return isset( $old[ $key ] ) ? esc_attr( $old[ $key ] ) : ''; };

	if ( isset( $_GET['applied'] ) ) {
		return '<div class="form-success"><h3>' . esc_html__( 'Application received.', 'dfw-crashpads-core' ) . '</h3><p>' . esc_html__( 'Thanks. We will text you within a day to set up a short call.', 'dfw-crashpads-core' ) . '</p></div>';
	}

	ob_start();
	?>
	<form class="dfw-apply" method="post" action="<?php echo esc_url( ( is_front_page() || ! get_permalink() ) ? home_url( '/#apply' ) : get_permalink() . '#apply' ); ?>" novalidate>
		<?php if ( $errors ) : ?>
			<div class="form-error" role="alert"><?php echo esc_html( implode( ' ', $errors ) ); ?></div>
		<?php endif; ?>
		<div class="form-grid">
			<label class="field" for="dfw-name">Your name<input id="dfw-name" name="dfw[name]" type="text" autocomplete="name" required value="<?php echo $v( 'name' ); ?>"></label>
			<label class="field" for="dfw-phone">Mobile phone<input id="dfw-phone" name="dfw[phone]" type="tel" autocomplete="tel" required value="<?php echo $v( 'phone' ); ?>"></label>
			<fieldset class="field full choice">
				<legend>I am a</legend>
				<div class="choice-row">
					<?php foreach ( array( 'Pilot', 'Other airline crew' ) as $opt ) : ?>
						<label><input type="radio" name="dfw[position]" value="<?php echo esc_attr( $opt ); ?>" <?php checked( $v( 'position' ) ? $v( 'position' ) : 'Pilot', $opt ); ?>> <?php echo esc_html( $opt ); ?></label>
					<?php endforeach; ?>
				</div>
			</fieldset>
			<fieldset class="field full choice">
				<legend>Sex <span class="muted">(optional, helps us match rooms)</span></legend>
				<div class="choice-row">
					<?php foreach ( array( 'Male', 'Female' ) as $opt ) : ?>
						<label><input type="radio" name="dfw[sex]" value="<?php echo esc_attr( $opt ); ?>" <?php checked( $v( 'sex' ), $opt ); ?>> <?php echo esc_html( $opt ); ?></label>
					<?php endforeach; ?>
				</div>
			</fieldset>
			<details class="full more-details" <?php echo ( $v( 'email' ) || $v( 'airline' ) || $v( 'start' ) ) ? 'open' : ''; ?>>
				<summary>Add more details (optional, saves time on the call)</summary>
				<div class="form-grid" style="margin-top: 14px;">
					<label class="field" for="dfw-email">Email<input id="dfw-email" name="dfw[email]" type="email" autocomplete="email" value="<?php echo $v( 'email' ); ?>"></label>
					<label class="field" for="dfw-airline">Airline<input id="dfw-airline" name="dfw[airline]" type="text" value="<?php echo $v( 'airline' ); ?>"></label>
					<label class="field" for="dfw-start">Move-in date<input id="dfw-start" name="dfw[start]" type="date" min="<?php echo esc_attr( gmdate( 'Y-m-d' ) ); ?>" value="<?php echo $v( 'start' ); ?>"></label>
					<label class="field" for="dfw-bed">Bed preference
						<select id="dfw-bed" name="dfw[bed]">
							<?php foreach ( array( 'Any available', 'Top bunk', 'Bottom bunk', 'Semi-private', 'Private' ) as $opt ) : ?>
								<option <?php selected( $v( 'bed' ), $opt ); ?>><?php echo esc_html( $opt ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
					<label class="field" for="dfw-source">How did you find us?
						<select id="dfw-source" name="dfw[source]">
							<?php foreach ( array( 'Google', 'Facebook', 'Referral from a friend', 'Airline forum or group chat', 'Other' ) as $opt ) : ?>
								<option <?php selected( $v( 'source' ), $opt ); ?>><?php echo esc_html( $opt ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
					<label class="field full" for="dfw-notes">Anything we should know?<textarea id="dfw-notes" name="dfw[notes]" rows="3"><?php echo esc_textarea( isset( $old['notes'] ) ? $old['notes'] : '' ); ?></textarea></label>
				</div>
			</details>
			<div class="hp-field" aria-hidden="true"><label>Leave this empty<input type="text" name="dfw_website" tabindex="-1" autocomplete="off"></label></div>
			<input type="hidden" name="dfw_t" value="<?php echo esc_attr( time() ); ?>">
			<?php wp_nonce_field( 'dfw_apply', 'dfw_apply_nonce' ); ?>
			<?php if ( get_option( 'dfw_core_turnstile_site' ) ) : ?>
				<div class="full cf-turnstile" id="dfw-turnstile"
					data-sitekey="<?php echo esc_attr( get_option( 'dfw_core_turnstile_site' ) ); ?>"
					data-theme="light"
					data-callback="dfwTurnstileReady"
					data-expired-callback="dfwTurnstileExpired"
					data-timeout-callback="dfwTurnstileExpired"
					data-error-callback="dfwTurnstileError"></div>
				<p class="form-note full" id="dfw-turnstile-msg" style="display:none;">The bot check could not load. Refresh the page, or just text us instead.</p>
				<button class="btn btn-cta btn-block full" type="submit" id="dfw-submit">Text me back</button>
				<script>
				/*
				 * Cloudflare's bot check is about 120 KB across three requests. Almost
				 * nobody who lands on the homepage fills in the form, so loading it up
				 * front slowed the page down for everyone to protect one form.
				 *
				 * Instead it loads the first time someone shows any sign of using the
				 * form: scrolling it into view, tapping it, or typing in it. By the time
				 * anyone has typed a name and a phone number the check has long finished,
				 * so the button behaves exactly as before. If somebody submits faster
				 * than that, the form waits for the check and then sends itself.
				 */
				(function () {
					var btn    = document.getElementById('dfw-submit');
					var msg    = document.getElementById('dfw-turnstile-msg');
					var form   = btn.form;
					var ready  = false;   // Turnstile has handed us a token
					var asked  = false;   // the script has been requested
					var queued = false;   // they pressed submit before the token arrived
					var timer  = null;

					function load() {
						if (asked) { return; }
						asked = true;
						var s = document.createElement('script');
						s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
						s.async = true;
						s.defer = true;
						s.onerror = function () { window.dfwTurnstileError(); };
						document.head.appendChild(s);
						// If it has not finished in 12 seconds, do not trap them here.
						timer = setTimeout(function () {
							if (!ready) { window.dfwTurnstileError(); }
						}, 12000);
					}

					window.dfwTurnstileReady = function () {
						ready = true;
						if (timer) { clearTimeout(timer); timer = null; }
						msg.style.display = 'none';
						if (queued) {          // they were waiting on us
							queued = false;
							btn.textContent = 'Sending...';
							form.submit();
						}
					};
					window.dfwTurnstileExpired = function () {
						ready = false;
						if (window.turnstile) { window.turnstile.reset('#dfw-turnstile'); }
					};
					window.dfwTurnstileError = function () {
						// Let it through: the form still has a honeypot and a timing check.
						ready = true;
						if (timer) { clearTimeout(timer); timer = null; }
						msg.style.display = 'block';
						if (queued) { queued = false; btn.textContent = 'Sending...'; form.submit(); }
					};

					// Load it at the first hint that this form is going to be used.
					['focusin', 'input', 'pointerdown', 'touchstart'].forEach(function (ev) {
						form.addEventListener(ev, load, { once: true, passive: true });
					});
					// And as soon as the form comes anywhere near the screen.
					if ('IntersectionObserver' in window) {
						var io = new IntersectionObserver(function (entries) {
							if (entries[0].isIntersecting) { io.disconnect(); load(); }
						}, { rootMargin: '600px' });
						io.observe(form);
					} else {
						load();
					}

					form.addEventListener('submit', function (e) {
						if (!ready) {
							e.preventDefault();
							queued = true;
							load();
							btn.disabled = true;
							btn.textContent = 'Just a moment...';
							setTimeout(function () { btn.disabled = false; }, 100);
							return;
						}
						// Stop double submits, which invalidate the token.
						btn.textContent = 'Sending...';
						setTimeout(function () { btn.disabled = true; }, 0);
					});
				})();
				</script>
			<?php else : ?>
				<button class="btn btn-cta btn-block full" type="submit">Text me back</button>
			<?php endif; ?>
			<p class="form-note full">We text you within a day to set up a quick call. Your details are only used to arrange your stay.</p>
		</div>
	</form>
	<?php
	return ob_get_clean();
}
add_shortcode( 'dfw_application_form', 'dfw_core_form_shortcode' );

/*
 * Turnstile is no longer enqueued here. The form loads it itself, the first
 * time someone touches the form or scrolls it near the screen. See the script
 * inside dfw_core_form_shortcode() above.
 *
 * To go back to loading it on every page view, add this to the theme's
 * functions.php:
 *   add_filter( 'dfw_turnstile_eager', '__return_true' );
 */
function dfw_core_enqueue_turnstile() {
	if ( get_option( 'dfw_core_turnstile_site' ) && apply_filters( 'dfw_turnstile_eager', false ) ) {
		wp_enqueue_script( 'cf-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js', array(), null, array( 'in_footer' => false, 'strategy' => 'async' ) );
	}
}
add_action( 'wp_enqueue_scripts', 'dfw_core_enqueue_turnstile' );

/* Verify the Turnstile token with Cloudflare. Returns true when Turnstile is not configured. */
function dfw_core_turnstile_ok() {
	$secret = get_option( 'dfw_core_turnstile_secret' );
	if ( ! get_option( 'dfw_core_turnstile_site' ) || ! $secret ) {
		return true;
	}
	$token = isset( $_POST['cf-turnstile-response'] ) ? sanitize_text_field( wp_unslash( $_POST['cf-turnstile-response'] ) ) : '';
	if ( ! $token ) {
		return false;
	}
	$res = wp_remote_post( 'https://challenges.cloudflare.com/turnstile/v0/siteverify', array(
		'body'    => array( 'secret' => $secret, 'response' => $token, 'remoteip' => isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '' ),
		'timeout' => 8,
	) );
	if ( is_wp_error( $res ) ) {
		return true; // Cloudflare unreachable: do not block real people.
	}
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	return ! empty( $body['success'] );
}

/* [dfw_phone] and [dfw_email]: scraper-proof contact links for page content. */
function dfw_core_phone_shortcode( $atts ) {
	$atts = shortcode_atts( array( 'label' => '', 'type' => 'tel' ), $atts );
	if ( function_exists( 'dfw_contact_link' ) ) {
		return dfw_contact_link( $atts['type'], $atts['label'] );
	}
	return esc_html( $atts['label'] ? $atts['label'] : 'Call or text us' );
}
add_shortcode( 'dfw_phone', 'dfw_core_phone_shortcode' );
add_shortcode( 'dfw_email', function ( $atts ) { $atts = shortcode_atts( array( 'label' => '' ), $atts ); return dfw_core_phone_shortcode( array( 'label' => $atts['label'], 'type' => 'mail' ) ); } );

/* Handle the submission before the page renders. */
function dfw_core_handle_submission() {
	if ( empty( $_POST['dfw_apply_nonce'] ) || ! isset( $_POST['dfw'] ) ) {
		return;
	}
	if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['dfw_apply_nonce'] ) ), 'dfw_apply' ) ) {
		$GLOBALS['dfw_core_errors'] = array( 'The form timed out. Please try again.' );
		return;
	}
	// Bots fill hidden fields and submit instantly.
	if ( ! empty( $_POST['dfw_website'] ) || ( isset( $_POST['dfw_t'] ) && time() - (int) $_POST['dfw_t'] < 3 ) ) {
		wp_safe_redirect( add_query_arg( 'applied', '1', home_url( '/' ) ) . '#apply' );
		exit;
	}

	$raw  = wp_unslash( $_POST['dfw'] );
	$data = array();
	foreach ( $GLOBALS['dfw_core_fields'] as $key => $label ) {
		$value        = isset( $raw[ $key ] ) ? $raw[ $key ] : '';
		$data[ $key ] = 'notes' === $key ? sanitize_textarea_field( $value ) : sanitize_text_field( $value );
	}
	$GLOBALS['dfw_core_old'] = $data;

	$errors = array();
	if ( strlen( $data['name'] ) < 2 ) {
		$errors[] = 'Please enter your full name.';
	}
	if ( '' !== $data['email'] && ! is_email( $data['email'] ) ) {
		$errors[] = 'That email address does not look right.';
	}
	if ( strlen( preg_replace( '/\D+/', '', $data['phone'] ) ) < 10 ) {
		$errors[] = 'Please enter a 10-digit mobile number.';
	}
	if ( '' !== $data['start'] && ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $data['start'] ) ) {
		$errors[] = 'That move-in date does not look right.';
	}
	if ( ! dfw_core_turnstile_ok() ) {
		$errors[] = 'The bot check did not finish. Please wait a moment for it to complete, then send again.';
	}
	if ( $errors ) {
		$GLOBALS['dfw_core_errors'] = $errors;
		return;
	}

	$post_id = wp_insert_post( array(
		'post_type'   => 'dfw_lead',
		'post_status' => 'private',
		'post_title'  => $data['name'],
	) );
	if ( $post_id ) {
		foreach ( $data as $key => $value ) {
			update_post_meta( $post_id, 'dfw_' . $key, $value );
		}
		update_post_meta( $post_id, 'dfw_ip', sanitize_text_field( isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '' ) );
	}

	dfw_core_notify( $data, $post_id );
	dfw_core_webhook( $data, $post_id );

	$thanks = (int) get_option( 'dfw_core_thankyou_page' );
	if ( $thanks && get_post_status( $thanks ) === 'publish' ) {
		wp_safe_redirect( get_permalink( $thanks ) );
	} else {
		wp_safe_redirect( add_query_arg( 'applied', '1', home_url( '/' ) ) . '#apply' );
	}
	exit;
}
add_action( 'template_redirect', 'dfw_core_handle_submission' );

/* Email Chad. */
function dfw_core_notify( $data, $post_id ) {
	$to = get_option( 'dfw_core_notify_email', get_option( 'admin_email' ) );
	if ( ! $to ) {
		return;
	}
	$digits  = preg_replace( '/\D+/', '', $data['phone'] );
	$subject = sprintf( 'New crashpad application: %s (%s)', $data['name'], trim( $data['position'] . ( $data['airline'] ? ', ' . $data['airline'] : '' ) ) );
	$lines   = array();
	foreach ( $GLOBALS['dfw_core_fields'] as $key => $label ) {
		$lines[] = $label . ': ' . $data[ $key ];
	}
	$lines[] = '';
	$lines[] = 'Text them: sms:+1' . dfw_sms_digits( $digits );
	$lines[] = 'Reply-to goes to their email only if they gave one.';
	$lines[] = 'View in WordPress: ' . admin_url( 'post.php?post=' . $post_id . '&action=edit' );
	wp_mail( $to, $subject, implode( "\n", $lines ), $data['email'] ? array( 'Reply-To: ' . $data['name'] . ' <' . $data['email'] . '>' ) : array() );
}

/* Send to the Google Sheet (Apps Script web app), if configured. */
function dfw_core_webhook( $data, $post_id ) {
	$url = get_option( 'dfw_core_webhook_url' );
	if ( ! $url ) {
		return;
	}
	$body = array_merge( $data, array( 'submitted' => current_time( 'c' ), 'lead_id' => $post_id, 'key' => get_option( 'dfw_core_api_key' ) ) );
	$res  = wp_remote_post( $url, array( 'body' => wp_json_encode( $body ), 'headers' => array( 'Content-Type' => 'application/json' ), 'timeout' => 10 ) );
	$msg  = is_wp_error( $res ) ? 'Failed: ' . $res->get_error_message() : 'Sent ' . current_time( 'M j g:i a' ) . ' (HTTP ' . wp_remote_retrieve_response_code( $res ) . ')';
	if ( $post_id ) {
		update_post_meta( $post_id, 'dfw_webhook_status', $msg );
	}
}

/* =========================================================
 * 4. Availability API: the app and tracker update the homepage pills
 *    GET  /wp-json/dfw/v1/availability          (public, read only)
 *    POST /wp-json/dfw/v1/availability          (header X-DFW-Key)
 *    Body: {"top":{"status":"soon","note":"Opening Nov 1"},"bottom":{"status":"waitlist"}}
 * ======================================================= */
function dfw_core_rest_routes() {
	register_rest_route( 'dfw/v1', '/availability', array(
		array( 'methods' => 'GET', 'callback' => 'dfw_core_rest_get', 'permission_callback' => '__return_true' ),
		array( 'methods' => 'POST', 'callback' => 'dfw_core_rest_set', 'permission_callback' => 'dfw_core_rest_auth' ),
	) );
}
add_action( 'rest_api_init', 'dfw_core_rest_routes' );

function dfw_core_rest_auth( $request ) {
	$key = $request->get_header( 'x-dfw-key' );
	return $key && hash_equals( (string) get_option( 'dfw_core_api_key' ), (string) $key );
}

function dfw_core_rest_get() {
	$out = array();
	foreach ( array( 'top', 'bottom', 'semi', 'private' ) as $k ) {
		$out[ $k ] = array(
			'status' => get_theme_mod( 'dfw_avail_' . $k, 'now' ),
			'note'   => get_theme_mod( 'dfw_avail_' . $k . '_note', '' ),
			'price'  => (int) ( function_exists( 'dfw_mod' ) ? dfw_mod( 'dfw_price_' . $k ) : get_theme_mod( 'dfw_price_' . $k, 0 ) ),
		);
	}
	return rest_ensure_response( $out );
}

function dfw_core_rest_set( $request ) {
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		return new WP_Error( 'bad_body', 'Send a JSON object.', array( 'status' => 400 ) );
	}
	// The tracker also sends the list of open beds, for the agreement bed dropdown.
	if ( isset( $body['beds'] ) && is_array( $body['beds'] ) ) {
		$beds = array();
		foreach ( $body['beds'] as $b ) {
			if ( empty( $b['id'] ) ) { continue; }
			$beds[] = array(
				'id'       => sanitize_text_field( $b['id'] ),
				'room'     => sanitize_text_field( $b['room'] ?? '' ),
				'category' => sanitize_text_field( $b['category'] ?? '' ),
				'price'    => absint( $b['price'] ?? 0 ),
			);
		}
		update_option( 'dfw_open_beds', $beds );
		update_option( 'dfw_open_beds_at', current_time( 'M j, g:i a' ) );
	}
	foreach ( array( 'top', 'bottom', 'semi', 'private' ) as $k ) {
		if ( empty( $body[ $k ] ) || ! is_array( $body[ $k ] ) ) {
			continue;
		}
		if ( isset( $body[ $k ]['status'] ) && in_array( $body[ $k ]['status'], array( 'now', 'soon', 'waitlist' ), true ) ) {
			set_theme_mod( 'dfw_avail_' . $k, $body[ $k ]['status'] );
		}
		if ( isset( $body[ $k ]['note'] ) ) {
			set_theme_mod( 'dfw_avail_' . $k . '_note', sanitize_text_field( $body[ $k ]['note'] ) );
		}
		if ( isset( $body[ $k ]['price'] ) ) {
			set_theme_mod( 'dfw_price_' . $k, absint( $body[ $k ]['price'] ) );
		}
	}
	return dfw_core_rest_get();
}

/* =========================================================
 * 5. Photo privacy: strip EXIF (including GPS) from JPEG uploads
 * ======================================================= */
function dfw_core_strip_exif( $upload ) {
	if ( empty( $upload['file'] ) || empty( $upload['type'] ) || 'image/jpeg' !== $upload['type'] ) {
		return $upload;
	}
	if ( ! function_exists( 'imagecreatefromjpeg' ) ) {
		return $upload;
	}
	$img = @imagecreatefromjpeg( $upload['file'] );
	if ( $img ) {
		@imagejpeg( $img, $upload['file'], 90 );
		imagedestroy( $img );
	}
	return $upload;
}
add_filter( 'wp_handle_upload', 'dfw_core_strip_exif' );

/* =========================================================
 * 6. Activation: create the Thank-you and FAQ pages if missing
 * ======================================================= */
function dfw_core_activate() {
	dfw_core_register_lead_type();
	if ( ! get_option( 'dfw_core_api_key' ) ) {
		update_option( 'dfw_core_api_key', wp_generate_password( 32, false ) );
	}
	if ( ! get_option( 'dfw_core_notify_email' ) ) {
		update_option( 'dfw_core_notify_email', get_option( 'admin_email' ) );
	}
	if ( ! get_page_by_path( 'thank-you' ) ) {
		$id = wp_insert_post( array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => 'Thank you',
			'post_name'    => 'thank-you',
			'post_content' => "<!-- wp:paragraph --><p><strong>Your application is in.</strong> We will text you within a day to set up a short call. If you want to talk sooner, [dfw_phone label=\"call or text us\"].</p><!-- /wp:paragraph -->\n<!-- wp:paragraph --><p>What happens next: a quick phone call, then a short online agreement and a $150 reservation fee to hold your bed. After that you get door access on your phone, and your bed is made when you arrive.</p><!-- /wp:paragraph -->",
		) );
		if ( $id && ! get_option( 'dfw_core_thankyou_page' ) ) {
			update_option( 'dfw_core_thankyou_page', $id );
		}
	}
	if ( ! get_page_by_path( 'faq' ) ) {
		wp_insert_post( array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => 'Frequently asked questions',
			'post_name'    => 'faq',
			'post_content' => dfw_core_faq_content(),
		) );
	}
	if ( function_exists( 'dfw_agr_install' ) ) {
		dfw_agr_install();
	}
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'dfw_core_activate' );

/* If the plugin was updated in place (not reactivated), make sure the template exists. */
function dfw_core_maybe_upgrade() {
	if ( get_option( 'dfw_core_version' ) !== '1.6.0' ) {
		if ( function_exists( 'dfw_agr_install' ) ) {
			dfw_agr_install();
		}
		flush_rewrite_rules();
		update_option( 'dfw_core_version', '1.6.0' );
	}
}
add_action( 'admin_init', 'dfw_core_maybe_upgrade' );

function dfw_core_faq_content() {
	$faq = array(
		array( 'Where is the crashpad?', 'A house 7.5 miles from DFW Airport. We share the exact address once you are approved, for the privacy and security of everyone staying there.' ),
		array( 'Who can stay?', 'Male airline pilots and crew who commute into DFW and keep a permanent home elsewhere. The crashpad is secondary housing, not a primary residence.' ),
		array( 'What is a cold bed?', 'A bed that is only yours for your whole stay. Nobody else sleeps in it. We do not do hot beds.' ),
		array( 'Is there a long commitment?', 'No. Some crashpads ask for 2 to 3 months up front. We ask for one month, then it is month to month. Your bed is yours all month, whether your schedule has you here a few nights or every night.' ),
		array( 'What does it cost?', 'Top bunks start at $330 a month, bottom bunks at $380, semi-private rooms at $450, and private rooms at $475. Smaller bunk rooms are $360 and $410. Rent is due on the 1st.' ),
		array( 'What is the reservation fee?', 'A $150 fee that holds your bed. It is refunded after you have stayed and paid for one month, when you move out with notice by the 15th of your final month.' ),
		array( 'How do I pay?', 'Zelle, Apple Pay, Venmo, PayPal, or Cash App.' ),
		array( 'Do I bring bedding?', 'No. Your bed comes with a pillow, sheets, a blanket, and a towel, cleaned and made before you arrive. You launder them during your stay; the washer and dryer are free.' ),
		array( 'How do I get in?', 'The doors use app-controlled smart locks. Once you are approved and paid, you unlock the front door from your phone.' ),
		array( 'Can I bring my car?', 'Yes. There is room for up to 7 cars at the house, and more on the street.' ),
		array( 'How clean is it?', 'Professional cleaners come every week for the kitchen, bathrooms, and living areas. Everyone cleans up after themselves in between.' ),
		array( 'Can I have visitors?', 'Visitors are welcome in common areas before quiet time (9 PM to 9 AM) but may not stay overnight or enter bedroom areas.' ),
		array( 'How do I give notice?', 'Text or email us by the 15th of your last month. If your airline releases your schedule or reassignment after the 15th, let us know within 48 hours and your notice still counts.' ),
	);
	$out = '';
	foreach ( $faq as $q ) {
		$out .= '<!-- wp:heading {"level":3} --><h3>' . esc_html( $q[0] ) . '</h3><!-- /wp:heading -->' . "\n";
		$out .= '<!-- wp:paragraph --><p>' . esc_html( $q[1] ) . '</p><!-- /wp:paragraph -->' . "\n";
	}
	$out .= '<!-- wp:paragraph --><p>Still have a question? [dfw_phone label="Call or text us"].</p><!-- /wp:paragraph -->';
	return $out;
}
