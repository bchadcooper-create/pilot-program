<?php
/**
 * DFW Crashpads Core: Agreements
 *
 * Sends the crashpad agreement to an approved applicant as a private link,
 * lets them sign it on their phone, records an audit trail (typed name,
 * initials on each rule, timestamp, IP, browser, and a fingerprint of the
 * exact text they saw), emails both parties a copy, and tells the tracker.
 *
 * Texas follows the Uniform Electronic Transactions Act (Bus. & Com. Code
 * ch. 322), so a typed signature with an audit trail is a valid signature.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* =========================================================
 * 1. Storage: one post per agreement
 * ======================================================= */
function dfw_agr_register_type() {
	register_post_type( 'dfw_agreement', array(
		'labels' => array(
			'name'          => 'Agreements',
			'singular_name' => 'Agreement',
			'menu_name'     => 'Agreements',
			'all_items'     => 'All agreements',
		),
		'public'       => false,
		'show_ui'      => true,
		'show_in_menu' => true,
		'menu_icon'    => 'dashicons-media-document',
		'supports'     => array( 'title' ),
		'capabilities' => array( 'create_posts' => 'do_not_allow' ), // created from a lead, never by hand
		'map_meta_cap' => true,
	) );
	add_rewrite_rule( '^sign/([A-Za-z0-9]{32})/?$', 'index.php?dfw_sign=$matches[1]', 'top' );
}
add_action( 'init', 'dfw_agr_register_type' );

function dfw_agr_query_vars( $vars ) {
	$vars[] = 'dfw_sign';
	return $vars;
}
add_filter( 'query_vars', 'dfw_agr_query_vars' );

/* =========================================================
 * 2. Settings additions
 * ======================================================= */
function dfw_agr_register_settings() {
	register_setting( 'dfw_core', 'dfw_agr_fee', array( 'sanitize_callback' => 'absint' ) );
	register_setting( 'dfw_core', 'dfw_agr_pay_instructions', array( 'sanitize_callback' => 'sanitize_textarea_field' ) );
	register_setting( 'dfw_core', 'dfw_agr_manager_name', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_agr_template_page', array( 'sanitize_callback' => 'absint' ) );
	register_setting( 'dfw_core', 'dfw_agr_groupme_link', array( 'sanitize_callback' => 'esc_url_raw' ) );
	register_setting( 'dfw_core', 'dfw_agr_apple_pay_number', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_agr_venmo', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'dfw_core', 'dfw_agr_manager_title', array( 'sanitize_callback' => 'sanitize_text_field' ) );
}
add_action( 'admin_init', 'dfw_agr_register_settings' );

function dfw_agr_settings_rows() {
	$tpl = (int) get_option( 'dfw_agr_template_page' );
	?>
	<tr><th colspan="2"><h2 style="margin:18px 0 0">Agreements</h2></th></tr>
	<tr>
		<th><label for="dfw_agr_manager_name">Manager name for signatures</label></th>
		<td><input type="text" class="regular-text" id="dfw_agr_manager_name" name="dfw_agr_manager_name" value="<?php echo esc_attr( get_option( 'dfw_agr_manager_name', 'Chad Cooper' ) ); ?>">
		<select name="dfw_agr_manager_title" style="margin-left:6px">
			<?php foreach ( array( 'Manager', 'Member', 'Managing Member' ) as $t ) : ?>
				<option value="<?php echo esc_attr( $t ); ?>" <?php selected( get_option( 'dfw_agr_manager_title', 'Manager' ), $t ); ?>><?php echo esc_html( $t ); ?></option>
			<?php endforeach; ?>
		</select>
		<p class="description">You sign as "Name, Title, DFW Crashpads, LLC" so the agreement is clearly signed for the company and not by you personally. Pick the title that matches your LLC filing.</p></td>
	</tr>
	<tr>
		<th><label for="dfw_agr_fee">Reservation fee ($)</label></th>
		<td><input type="number" min="0" id="dfw_agr_fee" name="dfw_agr_fee" value="<?php echo esc_attr( get_option( 'dfw_agr_fee', 150 ) ); ?>" style="width:90px"></td>
	</tr>
	<tr>
		<th><label for="dfw_agr_pay_instructions">How to pay the reservation fee</label></th>
		<td><textarea id="dfw_agr_pay_instructions" name="dfw_agr_pay_instructions" rows="4" class="large-text"><?php echo esc_textarea( get_option( 'dfw_agr_pay_instructions', "Zelle to manager@DFWCrashpads.com, or Apple Pay to (469) 264-6633.\nPut your payment code in the note." ) ); ?></textarea>
		<p class="description">Shown to the guest right after they sign.</p></td>
	</tr>
	<tr>
		<th><label for="dfw_agr_apple_pay_number">Apple Cash number</label></th>
		<td><input type="text" class="regular-text" id="dfw_agr_apple_pay_number" name="dfw_agr_apple_pay_number" value="<?php echo esc_attr( get_option( 'dfw_agr_apple_pay_number', '(469) 264-6633' ) ); ?>">
		<p class="description">Apple Cash is sent from inside Messages, so the guest gets an "Open Messages" button pointed at this number.</p></td>
	</tr>
	<tr>
		<th><label for="dfw_agr_venmo">Venmo username</label></th>
		<td>@<input type="text" class="regular-text" id="dfw_agr_venmo" name="dfw_agr_venmo" value="<?php echo esc_attr( get_option( 'dfw_agr_venmo', 'DFWCrashpads' ) ); ?>" placeholder="DFWCrashpads" style="width:220px">
		<p class="description">Without the @. Guests get a Venmo button with the amount and their payment code already filled in. Leave blank to hide it.</p></td>
	</tr>
	<tr>
		<th><label for="dfw_agr_groupme_link">GroupMe join link</label></th>
		<td><input type="url" class="regular-text" id="dfw_agr_groupme_link" name="dfw_agr_groupme_link" value="<?php echo esc_attr( get_option( 'dfw_agr_groupme_link' ) ); ?>" placeholder="https://groupme.com/join_group/90198279/xxxxxxxx">
		<p class="description">Optional. In GroupMe: open the group, Settings, Share Group, copy the link. New tenants then get a Join button after signing. Leave blank and they just get a "watch for an invite" note instead.</p></td>
	</tr>
	<tr>
		<th>Agreement text</th>
		<td><?php if ( $tpl && get_post( $tpl ) ) : ?>
			<a class="button" href="<?php echo esc_url( get_edit_post_link( $tpl ) ); ?>">Edit the agreement template</a>
			<p class="description">A private page. Edit it like any page. Keep the <code>{{merge_tags}}</code> where they are; they fill in per guest.</p>
		<?php else : ?>
			<em>Template page missing. Deactivate and reactivate the plugin to recreate it.</em>
		<?php endif; ?></td>
	</tr>
	<?php
}
add_action( 'dfw_core_settings_rows', 'dfw_agr_settings_rows' );

/* =========================================================
 * 3. The "Send agreement" box on an application
 * ======================================================= */
function dfw_agr_lead_box() {
	add_meta_box( 'dfw_agr_send', 'Agreement', 'dfw_agr_lead_box_html', 'dfw_lead', 'side', 'high' );
}
add_action( 'add_meta_boxes', 'dfw_agr_lead_box' );

function dfw_agr_lead_box_html( $post ) {
	$existing = dfw_agr_for_lead( $post->ID );
	if ( $existing ) {
		$status = get_post_meta( $existing->ID, 'dfw_agr_status', true );
		$url    = dfw_agr_url( get_post_meta( $existing->ID, 'dfw_agr_token', true ) );
		$phone  = preg_replace( '/\D+/', '', (string) get_post_meta( $post->ID, 'dfw_phone', true ) );
		$first  = explode( ' ', trim( get_post_meta( $existing->ID, 'dfw_agr_name', true ) ) )[0];
		$sms    = 'Hi ' . $first . ', here is your DFW Crashpads agreement. Takes about 5 minutes: ' . $url;

		if ( 'signed' === $status ) {
			echo '<p style="font-size:14px"><strong style="color:#1F7A46">Signed</strong><br>' . esc_html( get_post_meta( $existing->ID, 'dfw_agr_signed_at', true ) ) . '</p>';
			echo '<p><a class="button button-primary" style="width:100%;text-align:center" target="_blank" href="' . esc_url( $url ) . '">Open signed copy</a></p>';
		} else {
			$to = get_post_meta( $existing->ID, 'dfw_agr_email', true );
			echo '<p style="font-size:14px"><strong style="color:#B54708">Sent, waiting for signature</strong><br>Sent ' . esc_html( get_post_meta( $existing->ID, 'dfw_agr_sent_at', true ) ) . '<br>to ' . esc_html( $to ) . '</p>';
			if ( dfw_agr_own_email( $to ) ) {
				echo '<p style="background:#FEF0C7;border:1px solid #B54708;border-radius:6px;padding:8px;font-size:13px;color:#7A4A05">This is your own email, so the door key would go to your own TTLock account. Fine for a test.</p>';
			}
			echo '<p><a class="button button-primary" style="width:100%;text-align:center" target="_blank" href="' . esc_url( $url ) . '">Open the agreement</a></p>';
			if ( $phone ) {
				echo '<p><a class="button" style="width:100%;text-align:center" href="sms:+1' . esc_attr( dfw_sms_digits( $phone ) ) . '?&body=' . rawurlencode( $sms ) . '">Text them the link</a></p>';
			}
			echo '<p><button type="button" class="button" style="width:100%" onclick="navigator.clipboard.writeText(' . esc_attr( wp_json_encode( $url ) ) . ');this.textContent=\'Copied\'">Copy link</button></p>';
			echo '<p><a class="button" style="width:100%;text-align:center" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=dfw_agr_resend&agr=' . $existing->ID ), 'dfw_agr_resend_' . $existing->ID ) ) . '">Resend the email</a></p>';
		}
		if ( 'signed' !== $status ) {
			// Its own form, outside WordPress's edit form (a form inside a form is ignored by browsers).
			echo '<p style="margin-top:12px;border-top:1px solid #ddd;padding-top:10px">Need to change the bed, rent or date? Cancel this one, then send a new one below.</p>';
			echo '</div><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'Cancel this agreement? The link they have will stop working.\')"><input type="hidden" name="action" value="dfw_agr_cancel"><input type="hidden" name="lead_id" value="' . (int) $post->ID . '">' . wp_nonce_field( 'dfw_agr_cancel_' . $post->ID, '_wpnonce', true, false ) . '<button class="button" style="width:100%;color:#B42318;border-color:#B42318">Cancel and revise</button></form><div>';
		}
		echo '<p style="margin-top:12px"><a href="' . esc_url( get_edit_post_link( $existing->ID ) ) . '">Agreement record and audit trail</a></p>';
		return;
	}

	$email = get_post_meta( $post->ID, 'dfw_email', true );
	$start = get_post_meta( $post->ID, 'dfw_start', true );
	$bed   = get_post_meta( $post->ID, 'dfw_bed', true );
	$cats  = array( 'Top bunk' => 330, 'Bottom bunk' => 380, 'Semi-private' => 450, 'Private' => 475 );
	$mods  = array( 'Top bunk' => 'top', 'Bottom bunk' => 'bottom', 'Semi-private' => 'semi', 'Private' => 'private' );
	foreach ( $mods as $label => $k ) {
		$p = get_theme_mod( 'dfw_price_' . $k );
		if ( $p ) { $cats[ $label ] = (int) $p; }
	}
	$pick = isset( $cats[ $bed ] ) ? $bed : 'Top bunk';

	/*
	 * IMPORTANT: no <form> here. This box sits inside WordPress's own post
	 * edit form, and a form inside a form is ignored by browsers, so the
	 * button would just save the application. Instead the button builds a
	 * separate form in the page body and submits that.
	 */
	?>
	<div id="dfw-agr-box">
		<p><label>Their email<br><input type="email" id="dfw_agr_email" class="widefat" value="<?php echo esc_attr( $email ); ?>" placeholder="name@example.com"></label>
		<small id="dfw_agr_email_msg" style="color:#B42318;<?php echo $email ? 'display:none' : ''; ?>">Needed for the agreement and their door key.</small></p>
		<?php $open = dfw_agr_open_beds(); ?>
		<p><label>Bed<br>
			<select id="dfw_agr_bedsel" class="widefat">
				<?php if ( $open ) : ?>
					<optgroup label="Open now (from the tracker<?php echo get_option( 'dfw_open_beds_at' ) ? ', ' . esc_attr( get_option( 'dfw_open_beds_at' ) ) : ''; ?>)">
					<?php foreach ( $open as $b ) : ?>
						<option value="<?php echo esc_attr( $b['id'] ); ?>" data-cat="<?php echo esc_attr( $b['category'] ); ?>" data-price="<?php echo (int) $b['price']; ?>" <?php selected( $bed, $b['category'] ); ?>><?php echo esc_html( $b['id'] . ' · ' . $b['category'] . ' · $' . $b['price'] ); ?></option>
					<?php endforeach; ?>
					</optgroup>
				<?php endif; ?>
				<optgroup label="Hold a category, assign the bed later">
					<?php foreach ( $cats as $label => $price ) : ?>
						<option value="" data-cat="<?php echo esc_attr( $label ); ?>" data-price="<?php echo (int) $price; ?>" <?php echo ( ! $open && $pick === $label ) ? 'selected' : ''; ?>><?php echo esc_html( $label . ' (any) · $' . $price ); ?></option>
					<?php endforeach; ?>
				</optgroup>
			</select></label>
			<?php if ( ! $open ) : ?><small style="color:#B54708">No open-bed list from the tracker yet. Run Crashpads &gt; Move-ins and move-outs &gt; Push availability, then reload.</small><?php endif; ?></p>
		<p><label>Monthly rent ($)<br><input type="number" id="dfw_agr_rent" class="widefat" min="1" value=""></label>
		<small class="description">Filled from the bed's list price. Change it for an honored rate.</small></p>
		<p><label>Move-in date<br><input type="date" id="dfw_agr_movein" class="widefat" value="<?php echo esc_attr( $start ); ?>"></label></p>
		<p id="dfw_agr_err" style="color:#B42318;display:none"></p>
		<p><button type="button" id="dfw_agr_go" class="button button-primary button-large" style="width:100%">Send agreement</button></p>
		<p><small>Emails them a private signing link. You will also get buttons to text or copy it.</small></p>
	</div>
	<script>
	(function () {
		var $ = function (id) { return document.getElementById(id); };
		function syncBed() {
			var o = $('dfw_agr_bedsel').options[$('dfw_agr_bedsel').selectedIndex];
			if (o) { $('dfw_agr_rent').value = o.getAttribute('data-price'); }
		}
		$('dfw_agr_bedsel').addEventListener('change', syncBed);
		syncBed();
		$('dfw_agr_email').addEventListener('input', function () {
			$('dfw_agr_email_msg').style.display = this.value.trim() ? 'none' : '';
		});
		$('dfw_agr_go').addEventListener('click', function () {
			var email = $('dfw_agr_email').value.trim();
			var rent  = $('dfw_agr_rent').value.trim();
			var move  = $('dfw_agr_movein').value.trim();
			var err   = [];
			if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.push('Enter a valid email.'); }
			if (!(Number(rent) > 0)) { err.push('Enter the monthly rent.'); }
			if (!move) { err.push('Pick a move-in date.'); }
			if (err.length) { $('dfw_agr_err').textContent = err.join(' '); $('dfw_agr_err').style.display = ''; return; }

			var f = document.createElement('form');
			f.method = 'post';
			f.action = <?php echo wp_json_encode( admin_url( 'admin-post.php' ) ); ?>;
			var add = function (n, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); };
			add('action', 'dfw_agr_send');
			add('lead_id', <?php echo (int) $post->ID; ?>);
			add('_wpnonce', <?php echo wp_json_encode( wp_create_nonce( 'dfw_agr_send_' . $post->ID ) ); ?>);
			add('email', email);
			var o = $('dfw_agr_bedsel').options[$('dfw_agr_bedsel').selectedIndex];
			add('category', o.getAttribute('data-cat'));
			add('bed_id', o.value);
			add('rent', rent);
			add('move_in', move);
			document.body.appendChild(f);
			this.disabled = true; this.textContent = 'Sending...';
			f.submit();
		});
	})();
	</script>
	<?php
}

function dfw_agr_for_lead( $lead_id ) {
	// Newest first; a cancelled one (replaced by a revised agreement) does not count.
	$q = get_posts( array(
		'post_type'   => 'dfw_agreement',
		'post_status' => 'any',
		'numberposts' => 5,
		'orderby'     => 'date',
		'order'       => 'DESC',
		'meta_key'    => 'dfw_agr_lead_id',
		'meta_value'  => (int) $lead_id,
	) );
	foreach ( $q as $a ) {
		if ( 'cancelled' !== get_post_meta( $a->ID, 'dfw_agr_status', true ) ) {
			return $a;
		}
	}
	return null;
}

/**
 * Cancel an unsigned agreement so a revised one can be sent. The old link
 * stops working; the record is kept (status "cancelled") for the paper trail.
 */
function dfw_agr_cancel( $agr_id, $reason = '' ) {
	$status = get_post_meta( $agr_id, 'dfw_agr_status', true );
	if ( 'signed' === $status ) {
		return new WP_Error( 'signed', 'That agreement is already signed and cannot be cancelled here.' );
	}
	if ( 'cancelled' === $status ) {
		return true;
	}
	update_post_meta( $agr_id, 'dfw_agr_status', 'cancelled' );
	update_post_meta( $agr_id, 'dfw_agr_cancelled_at', current_time( 'M j, Y g:i a' ) );
	if ( $reason ) {
		update_post_meta( $agr_id, 'dfw_agr_cancel_reason', sanitize_text_field( $reason ) );
	}
	$lead_id = (int) get_post_meta( $agr_id, 'dfw_agr_lead_id', true );
	if ( $lead_id ) {
		update_post_meta( $lead_id, 'dfw_status', 'Approved' );
	}
	return true;
}

function dfw_agr_url( $token ) {
	if ( get_option( 'permalink_structure' ) ) {
		return home_url( '/sign/' . $token . '/' );
	}
	return add_query_arg( 'dfw_sign', $token, home_url( '/' ) );
}

/**
 * Is this agreement going to the manager's own inbox? The door key is sent to
 * the email on the agreement, so using your own address would put the guest's
 * eKey on your TTLock account. Fine for a test, wrong for a real booking.
 */
function dfw_agr_own_email( $email ) {
	$mine = array_filter( array(
		strtolower( trim( (string) get_option( 'dfw_core_notify_email' ) ) ),
		strtolower( trim( (string) get_option( 'admin_email' ) ) ),
		strtolower( trim( (string) get_option( 'dfw_core_mail_from' ) ) ),
	) );
	return in_array( strtolower( trim( $email ) ), $mine, true );
}

/** The open beds the tracker last pushed. */
function dfw_agr_open_beds() {
	$b = get_option( 'dfw_open_beds' );
	return is_array( $b ) ? $b : array();
}

/**
 * Create and send an agreement. Used by the admin button and by the phone
 * app through the REST endpoint. Returns the agreement post ID or a WP_Error.
 */
function dfw_agr_create( $lead_id, $args ) {
	$lead = get_post( $lead_id );
	if ( ! $lead || 'dfw_lead' !== $lead->post_type ) {
		return new WP_Error( 'no_lead', 'That application does not exist.' );
	}
	if ( dfw_agr_for_lead( $lead_id ) ) {
		return new WP_Error( 'exists', 'An agreement has already been sent for this application.' );
	}
	$name  = trim( $lead->post_title );
	$email = sanitize_email( $args['email'] ?? '' );
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'bad_email', 'A valid email is required.' );
	}
	$category = sanitize_text_field( $args['category'] ?? '' );
	$bed_id   = strtoupper( sanitize_text_field( $args['bed_id'] ?? '' ) );
	$rent     = (int) ( $args['rent'] ?? 0 );
	$move_in  = sanitize_text_field( $args['move_in'] ?? '' );
	if ( $rent < 1 ) {
		return new WP_Error( 'bad_rent', 'Monthly rent is required.' );
	}
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $move_in ) ) {
		return new WP_Error( 'bad_date', 'Move-in date is required (YYYY-MM-DD).' );
	}
	if ( $bed_id && ! $category ) {
		foreach ( dfw_agr_open_beds() as $b ) {
			if ( $b['id'] === $bed_id ) { $category = $b['category']; }
		}
	}
	$code  = $bed_id ? str_replace( '-', '', $bed_id ) : '';
	$token = wp_generate_password( 32, false, false );

	$agr_id = wp_insert_post( array(
		'post_type'   => 'dfw_agreement',
		'post_status' => 'private',
		'post_title'  => $name . ' - ' . ( $bed_id ? $bed_id : $category ),
	) );
	if ( ! $agr_id ) {
		return new WP_Error( 'insert', 'Could not create the agreement record.' );
	}
	$meta = array(
		'dfw_agr_lead_id'  => $lead_id,
		'dfw_agr_token'    => $token,
		'dfw_agr_status'   => 'sent',
		'dfw_agr_sent_at'  => current_time( 'M j, Y g:i a' ),
		'dfw_agr_name'     => $name,
		'dfw_agr_email'    => $email,
		'dfw_agr_phone'    => get_post_meta( $lead_id, 'dfw_phone', true ),
		'dfw_agr_airline'  => trim( get_post_meta( $lead_id, 'dfw_airline', true ) . ' ' . get_post_meta( $lead_id, 'dfw_position', true ) ),
		'dfw_agr_category' => $category,
		'dfw_agr_bed_id'   => $bed_id,
		'dfw_agr_rent'     => $rent,
		'dfw_agr_move_in'  => $move_in,
		'dfw_agr_code'     => $code,
		'dfw_agr_fee'      => (int) get_option( 'dfw_agr_fee', 150 ),
	);
	foreach ( $meta as $k => $v ) {
		update_post_meta( $agr_id, $k, $v );
	}
	update_post_meta( $lead_id, 'dfw_status', 'Agreement sent' );
	if ( ! get_post_meta( $lead_id, 'dfw_email', true ) ) {
		update_post_meta( $lead_id, 'dfw_email', $email );
	}
	dfw_agr_email_link( $agr_id );
	return $agr_id;
}

/** Handle "Send agreement" from the admin button. */
function dfw_agr_handle_send() {
	$lead_id = isset( $_POST['lead_id'] ) ? (int) $_POST['lead_id'] : 0;
	if ( ! current_user_can( 'edit_posts' ) || ! $lead_id ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dfw_agr_send_' . $lead_id );
	$res = dfw_agr_create( $lead_id, wp_unslash( $_POST ) );
	if ( is_wp_error( $res ) ) {
		if ( 'exists' === $res->get_error_code() ) {
			wp_safe_redirect( get_edit_post_link( $lead_id, 'raw' ) );
			exit;
		}
		wp_die( esc_html( $res->get_error_message() ) . ' <a href="javascript:history.back()">Go back</a>' );
	}
	wp_safe_redirect( add_query_arg( 'dfw_sent', 1, get_edit_post_link( $lead_id, 'raw' ) ) );
	exit;
}
add_action( 'admin_post_dfw_agr_send', 'dfw_agr_handle_send' );

/* A clear banner after sending, so it is obvious it worked. */
function dfw_agr_sent_notice() {
	if ( ! empty( $_GET['dfw_cancelled'] ) ) {
		echo '<div class="notice notice-warning is-dismissible"><p><strong>Agreement cancelled.</strong> Their old link no longer works. Send the revised one from the Agreement box.</p></div>';
	}
	if ( empty( $_GET['dfw_sent'] ) ) { return; }
	echo '<div class="notice notice-success is-dismissible"><p><strong>Agreement sent.</strong> The link is in the Agreement box on the right. You can text it to them from there.</p></div>';
}
add_action( 'admin_notices', 'dfw_agr_sent_notice' );

function dfw_agr_handle_resend() {
	$agr_id = isset( $_GET['agr'] ) ? (int) $_GET['agr'] : 0;
	if ( ! current_user_can( 'edit_posts' ) || ! $agr_id ) {
		wp_die( 'Not allowed.' );
	}
	check_admin_referer( 'dfw_agr_resend_' . $agr_id );
	dfw_agr_email_link( $agr_id );
	wp_safe_redirect( wp_get_referer() ?: admin_url() );
	exit;
}
add_action( 'admin_post_dfw_agr_resend', 'dfw_agr_handle_resend' );

/** "Cancel and revise" from the admin box: void the unsigned link, then the Send form comes back. */
function dfw_agr_handle_cancel() {
	$lead_id = (int) ( $_POST['lead_id'] ?? 0 );
	if ( ! current_user_can( 'edit_post', $lead_id ) || ! wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'dfw_agr_cancel_' . $lead_id ) ) {
		wp_die( 'Not allowed.' );
	}
	$have = dfw_agr_for_lead( $lead_id );
	if ( $have ) {
		dfw_agr_cancel( $have->ID, 'Cancelled from WordPress' );
	}
	wp_safe_redirect( add_query_arg( 'dfw_cancelled', 1, get_edit_post_link( $lead_id, 'raw' ) ) );
	exit;
}
add_action( 'admin_post_dfw_agr_cancel', 'dfw_agr_handle_cancel' );

function dfw_agr_email_link( $agr_id ) {
	$name  = get_post_meta( $agr_id, 'dfw_agr_name', true );
	$email = get_post_meta( $agr_id, 'dfw_agr_email', true );
	$url   = dfw_agr_url( get_post_meta( $agr_id, 'dfw_agr_token', true ) );
	$first = explode( ' ', trim( $name ) )[0];
	$mgr   = get_option( 'dfw_agr_manager_name', 'Chad Cooper' );
	$bed   = get_post_meta( $agr_id, 'dfw_agr_category', true );
	$move  = get_post_meta( $agr_id, 'dfw_agr_move_in', true );
	$moveP = $move ? date_i18n( 'F j', strtotime( $move ) ) : '';

	$inner  = '<p style="margin:0 0 14px">Hi ' . esc_html( $first ) . ',</p>';
	$inner .= '<p style="margin:0 0 14px">Here is your agreement for a <strong>' . esc_html( strtolower( $bed ) ) . '</strong>' . ( $moveP ? ' starting <strong>' . esc_html( $moveP ) . '</strong>' : '' ) . '. It takes about five minutes on your phone.</p>';
	$inner .= dfw_agr_email_button( $url, 'Review and sign' );
	$inner .= '<p style="margin:18px 0 14px">After you sign, you will see how to send the reservation fee, and I will set up your door access.</p>';
	$inner .= '<p style="margin:0 0 14px">Questions? Reply to this email or text ' . esc_html( dfw_phone_display_safe() ) . '.</p>';
	$inner .= '<p style="margin:0">' . esc_html( $mgr ) . '<br>DFW Crashpads</p>';

	wp_mail(
		$email,
		'Your DFW Crashpads agreement',
		dfw_agr_email_wrap( $inner ),
		array(
			'Content-Type: text/html; charset=UTF-8',
			'Reply-To: DFW Crashpads <' . get_option( 'dfw_core_notify_email', get_option( 'admin_email' ) ) . '>',
		)
	);
	update_post_meta( $agr_id, 'dfw_agr_last_emailed', current_time( 'M j, Y g:i a' ) );
}

/** A big tappable button that survives Gmail, Outlook, and iOS Mail. */
function dfw_agr_email_button( $url, $label ) {
	return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0"><tr><td style="border-radius:10px;background:#C2410C">'
		. '<a href="' . esc_url( $url ) . '" style="display:inline-block;padding:14px 26px;font:bold 17px Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:10px">' . esc_html( $label ) . '</a>'
		. '</td></tr></table>'
		. '<p style="margin:10px 0 0;font:13px Arial,sans-serif;color:#5A625D">Or open this link: <a href="' . esc_url( $url ) . '" style="color:#1F4D3B;word-break:break-all">' . esc_html( $url ) . '</a></p>';
}

/** Branded wrapper used by every DFW Crashpads email. */
function dfw_agr_email_wrap( $inner ) {
	return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F6F7F5">'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F6F7F5"><tr><td align="center" style="padding:20px 12px">'
		. '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #DDE3DF;border-radius:12px;overflow:hidden">'
		. '<tr><td style="background:#1F4D3B;padding:18px 24px;font:bold 22px Georgia,serif;color:#ffffff">DFW Crashpads</td></tr>'
		. '<tr><td style="padding:24px;font:16px/1.55 Arial,sans-serif;color:#1C1F1D">' . $inner . '</td></tr>'
		. '<tr><td style="padding:14px 24px;border-top:1px solid #DDE3DF;font:12px Arial,sans-serif;color:#5A625D">DFW Crashpads, LLC &middot; Crew housing near DFW</td></tr>'
		. '</table></td></tr></table></body></html>';
}

/** Ten digits for an sms: link, whatever way the number was typed (strips a leading 1 or +1). */
function dfw_sms_digits( $phone ) {
	$d = preg_replace( '/\D+/', '', (string) $phone );
	if ( 11 === strlen( $d ) && '1' === $d[0] ) {
		$d = substr( $d, 1 );
	}
	return $d;
}

function dfw_phone_display_safe() {
	return function_exists( 'dfw_phone_display' ) ? dfw_phone_display() : '(682) 250-0979';
}

/* =========================================================
 * 3b. REST: the phone app sends agreements through here
 *     POST /wp-json/dfw/v1/agreements   (header X-DFW-Key)
 *     Body: {lead_id?, name?, email, phone?, airline?, position?,
 *            category?, bed_id?, rent, move_in}
 *     If lead_id is missing, an application is created from name/email/phone.
 * ======================================================= */
function dfw_agr_rest_routes() {
	register_rest_route( 'dfw/v1', '/agreements', array(
		'methods'             => 'POST',
		'callback'            => 'dfw_agr_rest_create',
		'permission_callback' => 'dfw_core_rest_auth',
	) );
	register_rest_route( 'dfw/v1', '/agreements', array(
		'methods'             => 'GET',
		'callback'            => 'dfw_agr_rest_list',
		'permission_callback' => 'dfw_core_rest_auth',
	) );
}
add_action( 'rest_api_init', 'dfw_agr_rest_routes' );

function dfw_agr_rest_create( $request ) {
	$b = $request->get_json_params();
	if ( ! is_array( $b ) ) {
		return new WP_Error( 'bad_body', 'Send a JSON object.', array( 'status' => 400 ) );
	}
	$lead_id = (int) ( $b['lead_id'] ?? 0 );

	// Cancel an unsigned agreement (the app's "Cancel and revise"). Nothing else happens.
	if ( ! empty( $b['cancel'] ) ) {
		$have = $lead_id ? dfw_agr_for_lead( $lead_id ) : null;
		if ( ! $have ) {
			return new WP_Error( 'none', 'No agreement to cancel for this application.', array( 'status' => 404 ) );
		}
		$res = dfw_agr_cancel( $have->ID, $b['reason'] ?? 'Revised from the phone app' );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( $res->get_error_code(), $res->get_error_message(), array( 'status' => 409 ) );
		}
		return array( 'ok' => true, 'cancelled' => true, 'lead_id' => $lead_id, 'agreement' => $have->ID );
	}

	// Already have an agreement for this application? Hand back that link
	// rather than refusing. Tapping send twice should not be a dead end.
	if ( $lead_id && get_post( $lead_id ) ) {
		$have = dfw_agr_for_lead( $lead_id );
		if ( $have ) {
			$status = get_post_meta( $have->ID, 'dfw_agr_status', true );
			if ( ! empty( $b['resend'] ) && 'sent' === $status ) {
				dfw_agr_email_link( $have->ID );
			}
			return array(
				'ok'        => true,
				'already'   => true,
				'signed'    => ( 'signed' === $status ),
				'resent'    => ( ! empty( $b['resend'] ) && 'sent' === $status ),
				'lead_id'   => $lead_id,
				'agreement' => $have->ID,
				'url'       => dfw_agr_url( get_post_meta( $have->ID, 'dfw_agr_token', true ) ),
				'sent_to'   => get_post_meta( $have->ID, 'dfw_agr_email', true ),
				'sent_at'   => get_post_meta( $have->ID, 'dfw_agr_sent_at', true ),
				'signed_at' => get_post_meta( $have->ID, 'dfw_agr_signed_at', true ),
				'bed_id'    => get_post_meta( $have->ID, 'dfw_agr_bed_id', true ),
			);
		}
	}

	// A lookup or resend must never create anything. If there was no agreement
	// to find, say so rather than falling through and making a new one.
	if ( ! empty( $b['lookup'] ) || ! empty( $b['resend'] ) ) {
		return new WP_Error( 'none', 'No agreement has been sent for this application yet.', array( 'status' => 404 ) );
	}

	if ( ! $lead_id || ! get_post( $lead_id ) ) {
		$name = sanitize_text_field( $b['name'] ?? '' );
		if ( strlen( $name ) < 2 ) {
			return new WP_Error( 'no_name', 'A name is required when no lead_id is given.', array( 'status' => 400 ) );
		}
		// Same name already in the system? Reuse it. If they have an agreement
		// still waiting for a signature, hand back that link rather than
		// creating a twin.
		$existing = get_posts( array( 'post_type' => 'dfw_lead', 'post_status' => 'any', 'numberposts' => 20, 'orderby' => 'date', 'order' => 'DESC' ) );
		foreach ( $existing as $e ) {
			if ( strtolower( trim( $e->post_title ) ) !== strtolower( $name ) ) { continue; }
			$agr = dfw_agr_for_lead( $e->ID );
			if ( ! $agr ) { $lead_id = $e->ID; break; }
			if ( 'sent' === get_post_meta( $agr->ID, 'dfw_agr_status', true ) ) {
				return array(
					'ok'        => true,
					'already'   => true,
					'lead_id'   => $e->ID,
					'agreement' => $agr->ID,
					'url'       => dfw_agr_url( get_post_meta( $agr->ID, 'dfw_agr_token', true ) ),
					'sent_to'   => get_post_meta( $agr->ID, 'dfw_agr_email', true ),
				);
			}
			// Signed already: a returning tenant. Fall through and create a fresh application.
		}
		if ( ! $lead_id ) {
			$lead_id = wp_insert_post( array( 'post_type' => 'dfw_lead', 'post_status' => 'private', 'post_title' => $name ) );
			foreach ( array( 'email', 'phone', 'airline', 'position' ) as $k ) {
				if ( ! empty( $b[ $k ] ) ) { update_post_meta( $lead_id, 'dfw_' . $k, sanitize_text_field( $b[ $k ] ) ); }
			}
			update_post_meta( $lead_id, 'dfw_source', 'Created from the phone app' );
		}
	}
	$res = dfw_agr_create( $lead_id, $b );
	if ( is_wp_error( $res ) ) {
		return new WP_Error( $res->get_error_code(), $res->get_error_message(), array( 'status' => 400 ) );
	}
	$sent_to = get_post_meta( $res, 'dfw_agr_email', true );
	return array(
		'ok'        => true,
		'lead_id'   => $lead_id,
		'agreement' => $res,
		'url'       => dfw_agr_url( get_post_meta( $res, 'dfw_agr_token', true ) ),
		'sent_to'   => $sent_to,
		'warning'   => dfw_agr_own_email( $sent_to )
			? 'This went to your own email, so the door key would land on your TTLock account. Fine for a test; use the guest\'s address for a real booking.'
			: '',
	);
}

/** Every agreement and its status, so the app can show them. */
function dfw_agr_rest_list() {
	$out = array();
	foreach ( get_posts( array( 'post_type' => 'dfw_agreement', 'post_status' => 'any', 'numberposts' => 100 ) ) as $a ) {
		$m = function ( $k ) use ( $a ) { return get_post_meta( $a->ID, 'dfw_agr_' . $k, true ); };
		if ( 'cancelled' === $m( 'status' ) ) { continue; }
		$out[] = array(
			'name' => $m( 'name' ), 'status' => $m( 'status' ), 'bed_id' => $m( 'bed_id' ),
			'category' => $m( 'category' ), 'rent' => (int) $m( 'rent' ), 'move_in' => $m( 'move_in' ),
			'sent_at' => $m( 'sent_at' ), 'signed_at' => $m( 'signed_at' ), 'url' => dfw_agr_url( $m( 'token' ) ),
			'lead_id' => (int) $m( 'lead_id' ),
		);
	}
	return $out;
}

/* =========================================================
 * 4. The public signing page
 * ======================================================= */
function dfw_agr_template_router( $template ) {
	$token = get_query_var( 'dfw_sign' );
	if ( ! $token ) {
		return $template;
	}
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow', true );

	$agr = dfw_agr_by_token( $token );
	if ( ! $agr ) {
		status_header( 404 );
		dfw_agr_render_shell( 'Link not found', '<p>This signing link is not valid. It may have been replaced by a newer one. Text ' . esc_html( dfw_phone_display_safe() ) . ' and we will send a fresh link.</p>' );
		exit;
	}

	if ( 'cancelled' === get_post_meta( $agr->ID, 'dfw_agr_status', true ) ) {
		status_header( 410 );
		dfw_agr_render_shell( 'This agreement was replaced', '<p>A newer version of your agreement was sent. Please use the latest link we texted or emailed you. If you cannot find it, text ' . esc_html( dfw_phone_display_safe() ) . ' and we will resend it.</p>' );
		exit;
	}

	if ( 'POST' === $_SERVER['REQUEST_METHOD'] && isset( $_POST['dfw_agr_sign'] ) ) {
		dfw_agr_handle_sign( $agr );
		// falls through to render with errors, or redirects on success
	}

	dfw_agr_render_page( $agr );
	exit;
}
add_filter( 'template_include', 'dfw_agr_template_router', 99 );

function dfw_agr_by_token( $token ) {
	if ( ! preg_match( '/^[A-Za-z0-9]{32}$/', $token ) ) {
		return null;
	}
	$q = get_posts( array(
		'post_type'   => 'dfw_agreement',
		'post_status' => 'any',
		'numberposts' => 1,
		'meta_key'    => 'dfw_agr_token',
		'meta_value'  => $token,
	) );
	return $q ? $q[0] : null;
}

/** All the values that fill the template. */
function dfw_agr_merge_values( $agr ) {
	$m = function ( $k ) use ( $agr ) { return get_post_meta( $agr->ID, 'dfw_agr_' . $k, true ); };
	$move_in = $m( 'move_in' );
	$move_in_pretty = $move_in ? date_i18n( 'F j, Y', strtotime( $move_in ) ) : '';
	return array(
		'guest_name'      => $m( 'name' ),
		'guest_email'     => $m( 'email' ),
		'guest_phone'     => $m( 'phone' ),
		'airline'         => $m( 'airline' ),
		'bed_category'    => $m( 'category' ),
		'bed_id'          => $m( 'bed_id' ) ?: 'Assigned before move-in',
		'rent'            => number_format( (int) $m( 'rent' ) ),
		'move_in'         => $move_in_pretty,
		'payment_code'    => $m( 'code' ) ?: 'Given with your bed assignment',
		'reservation_fee' => number_format( (int) $m( 'fee' ) ),
		'manager_name'    => get_option( 'dfw_agr_manager_name', 'Chad Cooper' ),
		'manager_email'   => 'Manager@DFWCrashpads.com',
		'manager_phone'   => dfw_phone_display_safe(),
	);
}

/** The agreement text with values filled in. */
function dfw_agr_merged_html( $agr ) {
	// A signed agreement shows exactly what was signed, never the current template.
	$frozen = get_post_meta( $agr->ID, 'dfw_agr_frozen_html', true );
	if ( $frozen ) {
		return $frozen;
	}
	$html = dfw_agr_template_source();
	foreach ( dfw_agr_merge_values( $agr ) as $k => $v ) {
		$html = str_replace( '{{' . $k . '}}', esc_html( $v ), $html );
	}
	return $html;
}

/**
 * The agreement text to merge from.
 * Prefers the editable template page, but never depends on it: if the page is
 * missing, trashed or emptied, the copy built into the plugin is used and the
 * page is rebuilt, so a guest can never be shown a blank agreement.
 */
function dfw_agr_template_source() {
	$tpl_id = (int) get_option( 'dfw_agr_template_page' );
	$tpl    = $tpl_id ? get_post( $tpl_id ) : null;

	if ( $tpl && 'trash' !== $tpl->post_status && strlen( trim( wp_strip_all_tags( $tpl->post_content ) ) ) > 400 ) {
		return apply_filters( 'the_content', $tpl->post_content );
	}

	$fallback = dfw_agr_template_html();
	if ( $tpl && 'trash' === $tpl->post_status ) {
		wp_untrash_post( $tpl->ID );
		$tpl = get_post( $tpl->ID );
	}
	if ( $tpl ) {
		wp_update_post( array( 'ID' => $tpl->ID, 'post_content' => $fallback, 'post_status' => 'private' ) );
	} else {
		$new = wp_insert_post( array(
			'post_type'    => 'page',
			'post_status'  => 'private',
			'post_title'   => 'Crashpad Agreement Template',
			'post_name'    => 'crashpad-agreement-template',
			'post_content' => $fallback,
		) );
		if ( $new ) {
			update_option( 'dfw_agr_template_page', $new );
		}
	}
	return apply_filters( 'the_content', $fallback );
}

/** The house rules, pulled from the template so initials line up with the text. */
/**
 * The exact line to put in a payment note. Uses the payment code when a bed
 * is assigned, otherwise the guest's name, so the instruction is never vague.
 */
function dfw_agr_note_line( $agr ) {
	$code = get_post_meta( $agr->ID, 'dfw_agr_code', true );
	$name = get_post_meta( $agr->ID, 'dfw_agr_name', true );
	if ( $code ) {
		return 'Put <strong style="font-size:1.15em;letter-spacing:.5px">' . esc_html( $code ) . '</strong> in the payment note. That is your payment code; use it on every payment.';
	}
	return 'Put your name, <strong>' . esc_html( $name ) . '</strong>, in the payment note. You will get a payment code once your bed is assigned.';
}

/**
 * A Venmo link with the amount and the note already filled in. On a phone this
 * opens the Venmo app on the payment screen; on a computer it opens the web
 * page. Returns '' when no username is set.
 */
function dfw_agr_venmo_link( $amount, $note ) {
	$user = ltrim( trim( (string) get_option( 'dfw_agr_venmo', 'DFWCrashpads' ) ), '@' );
	if ( ! $user ) {
		return '';
	}
	return add_query_arg( array(
		'txn'        => 'pay',
		'audience'   => 'private',
		'recipients' => rawurlencode( $user ),
		'amount'     => (int) $amount,
		'note'       => rawurlencode( $note ),
	), 'https://venmo.com/' );
}

/** What the guest should put in a payment note: their code, or their name. */
function dfw_agr_payment_note( $agr ) {
	$code = get_post_meta( $agr->ID, 'dfw_agr_code', true );
	return $code ? $code : get_post_meta( $agr->ID, 'dfw_agr_name', true );
}

/**
 * The steps after signing, with working links. One place, used by both the
 * confirmation page and the emailed copy, so the two never drift apart.
 *
 * On the links: Zelle and Apple Cash have no web link that can start a
 * payment. Zelle lives inside each bank's own app and Apple Cash lives inside
 * Messages, so the Apple Cash step opens a text to our number, which is where
 * the payment is actually sent from.
 */
function dfw_agr_next_steps_html( $agr ) {
	$vals  = dfw_agr_merge_values( $agr );
	$email = $vals['guest_email'];
	$phone = preg_replace( '/\D+/', '', dfw_phone_display_safe() );
	$pay   = preg_replace( '/\D+/', '', get_option( 'dfw_agr_apple_pay_number', '4692646633' ) );
	$join  = get_option( 'dfw_agr_groupme_link' );
	$a     = 'style="display:inline-block;margin-top:6px;padding:9px 13px;background:#ffffff;border:1px solid #1F4D3B;border-radius:9px;text-decoration:none;font-size:14px;color:#1F4D3B;font-weight:600"';

	$h  = '<li><strong>Send the $' . esc_html( $vals['reservation_fee'] ) . ' reservation fee.</strong><br>';
	$h .= dfw_agr_pay_html( $agr ) . '<br>';
	$venmo = dfw_agr_venmo_link( (int) get_post_meta( $agr->ID, 'dfw_agr_fee', true ), dfw_agr_payment_note( $agr ) );
	if ( $venmo ) {
		$h .= '<a href="' . esc_url( $venmo ) . '" ' . $a . ' target="_blank" rel="noopener">Pay with Venmo</a> ';
	}
	$h .= '<a href="sms:+1' . esc_attr( dfw_sms_digits( $pay ) ) . '" ' . $a . '>Open Messages for Apple Cash</a> ';
	$h .= '<a href="https://www.zellepay.com/get-started" ' . $a . ' target="_blank" rel="noopener">How Zelle works</a>';
	$h .= '</li>';

	$h .= '<li><strong>Install the TTLock app</strong> and create an account using <strong>' . esc_html( $email ) . '</strong>. Your door key is sent to that account before you arrive.<br>';
	$h .= '<a href="https://apps.apple.com/us/app/ttlock/id1033046018" ' . $a . ' target="_blank" rel="noopener">TTLock for iPhone</a> ';
	$h .= '<a href="https://play.google.com/store/search?q=TTLock&c=apps" ' . $a . ' target="_blank" rel="noopener">TTLock for Android</a>';
	$h .= '</li>';

	$h .= '<li><strong>' . ( $join ? 'Join the house GroupMe.' : 'Watch for a GroupMe invite.' ) . '</strong> That is where the house talks.<br>';
	if ( $join ) {
		$h .= '<a href="' . esc_url( $join ) . '" ' . $a . ' target="_blank" rel="noopener">Join the group</a> ';
	}
	$h .= '<a href="https://apps.apple.com/us/app/groupme/id392796698" ' . $a . ' target="_blank" rel="noopener">GroupMe for iPhone</a> ';
	$h .= '<a href="https://play.google.com/store/apps/details?id=com.groupme.android" ' . $a . ' target="_blank" rel="noopener">GroupMe for Android</a>';
	$h .= '</li>';

	$h .= '<li><strong>Questions?</strong><br><a href="sms:+1' . esc_attr( dfw_sms_digits( $phone ) ) . '" ' . $a . '>Text us at ' . esc_html( dfw_phone_display_safe() ) . '</a></li>';
	return $h;
}

/** Payment instructions with any "payment code" wording replaced by the real code. */
function dfw_agr_pay_html( $agr ) {
	$venmo = ltrim( trim( (string) get_option( 'dfw_agr_venmo', 'DFWCrashpads' ) ), '@' );
	$default = "Zelle to manager@DFWCrashpads.com, or Apple Pay to (469) 264-6633."
		. ( $venmo ? "\nVenmo: @" . $venmo . "." : '' )
		. "\nPut your payment code in the note.";
	$raw  = get_option( 'dfw_agr_pay_instructions', $default );
	// If the saved instructions predate Venmo, mention it anyway.
	if ( $venmo && false === stripos( $raw, 'venmo' ) ) {
		$raw .= "\nVenmo: @" . $venmo . ".";
	}
	// Drop any generic "put your payment code in the note" line; the specific line below replaces it.
	$lines = array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', $raw ) ), function ( $l ) {
		return $l !== '' && ! preg_match( '/payment code/i', $l );
	} );
	return nl2br( esc_html( implode( "\n", $lines ) ) ) . '<br>' . dfw_agr_note_line( $agr );
}

/** Initials from a name: first letter of the first and last word. "Shawn de Mulle" -> "SM". */
function dfw_agr_initials_for( $name ) {
	$parts = preg_split( '/\s+/', trim( (string) $name ) );
	$parts = array_values( array_filter( $parts ) );
	if ( ! $parts ) { return ''; }
	$first = mb_substr( $parts[0], 0, 1 );
	$last  = count( $parts ) > 1 ? mb_substr( end( $parts ), 0, 1 ) : '';
	return mb_strtoupper( $first . $last );
}

function dfw_agr_rules() {
	return array(
		'Airline crew only',
		'Commuter housing, not a main residence',
		'Professional atmosphere',
		'Quiet time 9 PM to 9 AM',
		'Visitors',
		'Cleanliness, trash and recycling',
		'Sleep only in your bed',
		'No smoking or vaping indoors',
		'No illegal activity',
		'Door security and access logs',
	);
}

function dfw_agr_render_page( $agr ) {
	$status  = get_post_meta( $agr->ID, 'dfw_agr_status', true );
	$vals    = dfw_agr_merge_values( $agr );
	$html    = dfw_agr_merged_html( $agr );
	$errors  = $GLOBALS['dfw_agr_errors'] ?? array();
	$old     = $GLOBALS['dfw_agr_old'] ?? array();
	$just    = isset( $_GET['done'] );

	ob_start();
	?>
	<?php if ( 'signed' === $status ) : ?>
		<?php if ( $just ) : ?>
		<div class="notice ok">
			<h2>Signed. You're in.</h2>
			<p>A copy has been emailed to you and to us. Here is what happens next.</p>
			<ol class="next">
				<?php echo dfw_agr_next_steps_html( $agr ); ?>
			</ol>
		</div>
		<?php endif; ?>
		<div class="signed-stamp">
			<strong>Signed electronically</strong><br>
			<?php echo esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_name', true ) ); ?>, <?php echo esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_at', true ) ); ?><br>
			<small>Reference <?php echo esc_html( substr( get_post_meta( $agr->ID, 'dfw_agr_hash', true ), 0, 12 ) ); ?></small>
		</div>
		<p class="print-row"><button onclick="window.print()" class="btn">Print or save as PDF</button></p>
		<div class="agreement"><?php echo $html; ?></div>
		<?php echo dfw_agr_signature_block_html( $agr ); ?>

	<?php else : ?>
		<?php if ( $errors ) : ?>
			<div class="notice err"><ul><?php foreach ( $errors as $e ) : ?><li><?php echo esc_html( $e ); ?></li><?php endforeach; ?></ul></div>
		<?php endif; ?>
		<p class="lead">Hi <?php echo esc_html( explode( ' ', $vals['guest_name'] )[0] ); ?>. Read this through, then sign at the bottom. It takes about five minutes.</p>
		<div class="agreement"><?php echo $html; ?></div>

		<form method="post" class="signform" id="signform">
			<input type="hidden" name="dfw_agr_sign" value="1">
			<?php wp_nonce_field( 'dfw_agr_sign_' . $agr->ID, 'dfw_agr_nonce' ); ?>

			<h2>Initial each house rule</h2>
			<p class="muted">Tap each rule to add your initials (<?php echo esc_html( dfw_agr_initials_for( $vals['guest_name'] ) ); ?>). Each tap confirms you have read that rule.</p>
			<div class="rules">
			<?php
			$ini = dfw_agr_initials_for( $vals['guest_name'] );
			foreach ( dfw_agr_rules() as $i => $rule ) :
				$done = ! empty( $old['initials'][ $i ] );
				?>
				<button type="button" class="rule<?php echo $done ? ' on' : ''; ?>" data-i="<?php echo (int) $i; ?>" aria-pressed="<?php echo $done ? 'true' : 'false'; ?>">
					<span class="rtext"><?php echo (int) $i + 1; ?>. <?php echo esc_html( $rule ); ?></span>
					<span class="rini"><?php echo $done ? esc_html( $ini ) : 'Tap'; ?></span>
				</button>
				<input type="hidden" name="initials[<?php echo (int) $i; ?>]" value="<?php echo $done ? esc_attr( $ini ) : ''; ?>">
			<?php endforeach; ?>
			</div>
			<p class="muted" id="rulecount"></p>

			<h2>Confirm</h2>
			<label class="check"><input type="checkbox" name="ack_fee" required <?php checked( ! empty( $old['ack_fee'] ) ); ?>><span>I understand the <strong>reservation fee</strong> terms in Part 3: it is refunded only if I give written notice by the 15th of my last month (or under the airline schedule exception), and it is not refundable if I cancel before moving in.</span></label>
			<label class="check"><input type="checkbox" name="ack_repair" required <?php checked( ! empty( $old['ack_repair'] ) ); ?>><span>I have read the <strong>tenant repair remedies</strong> paragraph in Part 5.</span></label>
			<label class="check"><input type="checkbox" name="ack_esign" required <?php checked( ! empty( $old['ack_esign'] ) ); ?>><span>I agree to sign electronically and I have read the whole agreement, including the house rules.</span></label>

			<h2>Sign</h2>
			<label class="field">Type your full legal name<br>
				<input type="text" name="signed_name" required autocomplete="name" value="<?php echo esc_attr( $old['signed_name'] ?? '' ); ?>" placeholder="<?php echo esc_attr( $vals['guest_name'] ); ?>"></label>
			<p class="muted">Typing your name here is your signature. Today's date and time are recorded automatically.</p>
			<button type="submit" class="btn primary">Sign the agreement</button>
		</form>
		<script>
		(function () {
			var ini = <?php echo wp_json_encode( dfw_agr_initials_for( $vals['guest_name'] ) ); ?>;
			var rules = document.querySelectorAll('.rule');
			var count = document.getElementById('rulecount');
			function refresh() {
				var n = document.querySelectorAll('.rule.on').length;
				count.textContent = n === rules.length ? 'All ' + n + ' rules initialed.' : n + ' of ' + rules.length + ' initialed.';
				count.style.color = n === rules.length ? '#1F7A46' : '';
			}
			rules.forEach(function (b) {
				b.addEventListener('click', function () {
					var on = !b.classList.contains('on');
					b.classList.remove('nudge');
					b.classList.toggle('on', on);
					b.setAttribute('aria-pressed', on ? 'true' : 'false');
					b.querySelector('.rini').textContent = on ? ini : 'Tap';
					b.nextElementSibling.value = on ? ini : '';
					refresh();
				});
			});
			refresh();
			document.getElementById('signform').addEventListener('submit', function (e) {
				var missing = document.querySelectorAll('.rule:not(.on)');
				if (missing.length) {
					e.preventDefault();
					missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
					missing[0].classList.add('nudge');
					setTimeout(function () { missing[0].classList.remove('nudge'); }, 900);
					count.textContent = 'Please tap every rule. ' + missing.length + ' left.';
					count.style.color = '#B42318';
				}
			});
		})();
		</script>
	<?php endif; ?>
	<?php
	dfw_agr_render_shell( 'Crashpad agreement: ' . $vals['guest_name'], ob_get_clean() );
}

function dfw_agr_signature_block_html( $agr ) {
	$mgr_name  = get_option( 'dfw_agr_manager_name', 'Chad Cooper' );
	$mgr_title = get_option( 'dfw_agr_manager_title', 'Manager' );
	// Sign on behalf of the company, never personally.
	$mgr = $mgr_name . ', ' . $mgr_title . ', DFW Crashpads, LLC';
	$initials = get_post_meta( $agr->ID, 'dfw_agr_initials', true );
	$rules = dfw_agr_rules();
	$h  = '<div class="sigblock"><h2>Signatures</h2><table>';
	$h .= '<tr><th></th><th>Guest</th><th>Manager (DFW Crashpads, LLC)</th></tr>';
	$h .= '<tr><td>Signature</td><td class="sig">' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_name', true ) ) . '</td><td class="sig">' . esc_html( $mgr ) . '</td></tr>';
	$h .= '<tr><td>Printed name</td><td>' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_name', true ) ) . '</td><td>' . esc_html( $mgr ) . '</td></tr>';
	$h .= '<tr><td>Date</td><td>' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_at', true ) ) . '</td><td>' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_sent_at', true ) ) . '</td></tr>';
	$h .= '</table>';
	if ( is_array( $initials ) ) {
		$h .= '<h3>House rules initialed</h3><table class="initials">';
		foreach ( $rules as $i => $r ) {
			$h .= '<tr><td>' . ( $i + 1 ) . '. ' . esc_html( $r ) . '</td><td class="ini">' . esc_html( $initials[ $i ] ?? '' ) . '</td></tr>';
		}
		$h .= '</table>';
	}
	$h .= '<p class="audit">Electronic signature record: signed from IP ' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_ip', true ) ) . ' at ' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_signed_at', true ) ) . '. Document fingerprint ' . esc_html( get_post_meta( $agr->ID, 'dfw_agr_hash', true ) ) . '. Manager signature applied when the agreement was issued.</p>';
	$h .= '</div>';
	return $h;
}

/** Validate and record a signature. */
function dfw_agr_handle_sign( $agr ) {
	$errors = array();
	$old    = array(
		'initials'    => array_map( 'sanitize_text_field', (array) wp_unslash( $_POST['initials'] ?? array() ) ),
		'signed_name' => sanitize_text_field( wp_unslash( $_POST['signed_name'] ?? '' ) ),
		'ack_fee'     => ! empty( $_POST['ack_fee'] ),
		'ack_repair'  => ! empty( $_POST['ack_repair'] ),
		'ack_esign'   => ! empty( $_POST['ack_esign'] ),
	);
	$GLOBALS['dfw_agr_old'] = $old;

	if ( 'signed' === get_post_meta( $agr->ID, 'dfw_agr_status', true ) ) {
		return; // already done, just show it
	}
	if ( ! isset( $_POST['dfw_agr_nonce'] ) || ! wp_verify_nonce( $_POST['dfw_agr_nonce'], 'dfw_agr_sign_' . $agr->ID ) ) {
		$errors[] = 'This page sat open too long. Please refresh and sign again.';
	}
	$rules    = dfw_agr_rules();
	$expect   = dfw_agr_initials_for( get_post_meta( $agr->ID, 'dfw_agr_name', true ) );
	$initials = array();
	$missing  = array();
	foreach ( $rules as $i => $r ) {
		$v = strtoupper( trim( $old['initials'][ $i ] ?? '' ) );
		if ( $v !== $expect ) {
			$missing[] = $i + 1;
		}
		$initials[ $i ] = $v;
	}
	if ( $missing ) {
		$errors[] = 'Please tap house rule' . ( count( $missing ) > 1 ? 's ' : ' ' ) . implode( ', ', $missing ) . ' to initial ' . ( count( $missing ) > 1 ? 'them' : 'it' ) . '.';
	}
	if ( ! $old['ack_fee'] || ! $old['ack_repair'] || ! $old['ack_esign'] ) {
		$errors[] = 'Please tick all three confirmation boxes.';
	}
	$expected = strtolower( trim( get_post_meta( $agr->ID, 'dfw_agr_name', true ) ) );
	$typed    = strtolower( trim( $old['signed_name'] ) );
	if ( strlen( $typed ) < 3 ) {
		$errors[] = 'Please type your full name.';
	} elseif ( $expected && $typed !== $expected && similar_text( $typed, $expected ) < strlen( $expected ) * 0.6 ) {
		$errors[] = 'The name you typed does not match the name on the agreement (' . get_post_meta( $agr->ID, 'dfw_agr_name', true ) . '). If your legal name is different, text us and we will correct it.';
	}

	if ( $errors ) {
		$GLOBALS['dfw_agr_errors'] = $errors;
		return;
	}

	// Freeze exactly what they signed. Never record a signature against an
	// empty or broken agreement.
	$frozen = dfw_agr_merged_html( $agr );
	if ( strlen( trim( wp_strip_all_tags( $frozen ) ) ) < 1000 ) {
		$GLOBALS['dfw_agr_errors'] = array( 'The agreement text did not load. Please refresh the page and try again. If it happens twice, text us and we will send a new link.' );
		return;
	}
	$hash   = hash( 'sha256', $frozen . '|' . $old['signed_name'] . '|' . implode( ',', $initials ) );

	$now = current_time( 'M j, Y g:i a T' );
	update_post_meta( $agr->ID, 'dfw_agr_frozen_html', $frozen );
	update_post_meta( $agr->ID, 'dfw_agr_status', 'signed' );
	update_post_meta( $agr->ID, 'dfw_agr_signed_name', $old['signed_name'] );
	update_post_meta( $agr->ID, 'dfw_agr_signed_at', $now );
	update_post_meta( $agr->ID, 'dfw_agr_initials', $initials );
	update_post_meta( $agr->ID, 'dfw_agr_ip', sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' ) );
	update_post_meta( $agr->ID, 'dfw_agr_ua', sanitize_text_field( $_SERVER['HTTP_USER_AGENT'] ?? '' ) );
	update_post_meta( $agr->ID, 'dfw_agr_hash', $hash );

	$lead_id = (int) get_post_meta( $agr->ID, 'dfw_agr_lead_id', true );
	if ( $lead_id ) {
		update_post_meta( $lead_id, 'dfw_status', 'Signed' );
	}

	dfw_agr_email_copies( $agr );
	dfw_agr_notify_sheet( $agr );

	wp_safe_redirect( add_query_arg( 'done', 1, dfw_agr_url( get_post_meta( $agr->ID, 'dfw_agr_token', true ) ) ) );
	exit;
}

function dfw_agr_email_copies( $agr ) {
	$vals  = dfw_agr_merge_values( $agr );
	$url   = dfw_agr_url( get_post_meta( $agr->ID, 'dfw_agr_token', true ) );
	$first = explode( ' ', $vals['guest_name'] )[0];
	$fee   = $vals['reservation_fee'];
	$pay   = get_option( 'dfw_agr_pay_instructions', "Zelle to manager@DFWCrashpads.com, or Apple Pay to (469) 264-6633.\nPut your payment code in the note." );

	$doc  = '<div style="font-family:Georgia,serif;max-width:720px;margin:0 auto;line-height:1.5">';
	$doc .= dfw_agr_merged_html( $agr );
	$doc .= dfw_agr_signature_block_html( $agr );
	$doc .= '</div>';

	$guest_body  = '<div>';
	$guest_body .= '<p>Hi ' . esc_html( $first ) . ', your signed agreement is below. Keep this email.</p>';
	$guest_body .= '<p><strong>Next:</strong></p><ol style="padding-left:20px">';
	$guest_body .= dfw_agr_next_steps_html( $agr );
	$guest_body .= '</ol>';
	$guest_body .= '<p>You can always see your copy at <a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a>.</p><hr>';
	$guest_body .= $doc . '</div>';

	$headers = array( 'Content-Type: text/html; charset=UTF-8', 'Reply-To: DFW Crashpads <' . get_option( 'dfw_core_notify_email', get_option( 'admin_email' ) ) . '>' );
	wp_mail( $vals['guest_email'], 'Your signed DFW Crashpads agreement', dfw_agr_email_wrap( $guest_body ), $headers );

	$mgr_body  = '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;line-height:1.5">';
	$mgr_body .= '<p><strong>' . esc_html( $vals['guest_name'] ) . ' signed.</strong> ' . esc_html( $vals['bed_category'] ) . ( $vals['bed_id'] !== 'Assigned before move-in' ? ', ' . esc_html( $vals['bed_id'] ) : '' ) . ', $' . esc_html( $vals['rent'] ) . '/mo, moving in ' . esc_html( $vals['move_in'] ) . '.</p>';
	$mgr_body .= '<p>Watch for the $' . esc_html( $fee ) . ' reservation fee' . ( $vals['payment_code'] !== 'Given with your bed assignment' ? ' with code ' . esc_html( $vals['payment_code'] ) : '' ) . '. Then send their TTLock key to ' . esc_html( $vals['guest_email'] ) . '.</p>';
	$mgr_body .= '<p><a href="' . esc_url( $url ) . '">Signed copy</a> &middot; <a href="' . esc_url( get_edit_post_link( $agr->ID, 'raw' ) ) . '">Agreement record</a></p><hr>' . $doc . '</div>';
	wp_mail( get_option( 'dfw_core_notify_email', get_option( 'admin_email' ) ), 'Signed: ' . $vals['guest_name'], dfw_agr_email_wrap( $mgr_body ), array( 'Content-Type: text/html; charset=UTF-8' ) );
}

/** Tell the tracker sheet, using the same webhook the application form uses. */
function dfw_agr_notify_sheet( $agr ) {
	$url = get_option( 'dfw_core_webhook_url' );
	if ( ! $url ) {
		return;
	}
	$m = function ( $k ) use ( $agr ) { return get_post_meta( $agr->ID, 'dfw_agr_' . $k, true ); };
	$body = array(
		'event'     => 'signed',
		'key'       => get_option( 'dfw_core_api_key' ),
		'lead_id'   => (int) $m( 'lead_id' ),
		'name'      => $m( 'name' ),
		'email'     => $m( 'email' ),
		'phone'     => $m( 'phone' ),
		'airline'   => $m( 'airline' ),
		'category'  => $m( 'category' ),
		'bed_id'    => $m( 'bed_id' ),
		'rent'      => (int) $m( 'rent' ),
		'move_in'   => $m( 'move_in' ),
		'code'      => $m( 'code' ),
		'fee'       => (int) $m( 'fee' ),
		'signed_at' => $m( 'signed_at' ),
		'signed_by' => $m( 'signed_name' ),
		'copy_url'  => dfw_agr_url( $m( 'token' ) ),
	);
	$res = wp_remote_post( $url, array( 'body' => wp_json_encode( $body ), 'headers' => array( 'Content-Type' => 'application/json' ), 'timeout' => 10 ) );
	$msg = is_wp_error( $res ) ? 'Failed: ' . $res->get_error_message() : 'Sent (HTTP ' . wp_remote_retrieve_response_code( $res ) . ')';
	update_post_meta( $agr->ID, 'dfw_agr_sheet_status', $msg );
}

/** Minimal standalone page so it works on any theme and prints cleanly. */
function dfw_agr_render_shell( $title, $inner ) {
	?><!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?php echo esc_html( $title ); ?></title>
<style>
	:root{--brand:#1F4D3B;--cta:#C2410C;--ink:#1C1F1D;--muted:#5A625D;--line:#DDE3DF;--bg:#F6F7F5;}
	*{box-sizing:border-box}
	body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
	header{background:var(--brand);color:#fff;padding:16px 20px}
	header h1{margin:0;font:700 20px Georgia,serif}
	main{max-width:760px;margin:0 auto;padding:18px 16px 60px}
	.lead{font-size:17px}
	.agreement{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 18px;margin:14px 0}
	.agreement h2{font:700 19px Georgia,serif;color:var(--brand);margin:22px 0 8px}
	.agreement h1{font:700 24px Georgia,serif;margin:0 0 6px}
	.agreement table{border-collapse:collapse;width:100%;margin:10px 0 16px;font-size:15px}
	.agreement td,.agreement th{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
	.agreement th{background:var(--bg);width:44%}
	.agreement ol{padding-left:22px}.agreement li{margin:9px 0}
	.signform{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 18px}
	.signform h2{font:700 18px Georgia,serif;color:var(--brand);margin:6px 0 10px}
	.muted{color:var(--muted);font-size:14px}
	.rules{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
	.rule{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px 12px;min-height:54px;
		border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit;font-size:15px;color:var(--ink);text-align:left;cursor:pointer;
		-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s}
	.rule .rtext{flex:1}
	.rule .rini{flex-shrink:0;min-width:64px;padding:8px 10px;border-radius:8px;border:1px dashed #B8B1A5;text-align:center;font-weight:700;color:var(--muted);font-size:14px}
	.rule.on{background:#E8EFEA;border-color:var(--brand)}
	.rule.on .rini{border:0;background:var(--brand);color:#fff;font-family:Georgia,serif;font-style:italic;font-size:17px}
	.rule.nudge{border-color:#B42318;box-shadow:0 0 0 3px #FEE4E2}
	#rulecount{margin:4px 0 20px;font-weight:600}
	.check{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px;cursor:pointer}
	.check span{flex:1}
	.check input{width:22px;height:22px;flex-shrink:0;margin-top:2px;accent-color:var(--brand)}
	.field input{width:100%;font-size:18px;padding:12px;border:1px solid #B8B1A5;border-radius:9px;margin-top:6px;font-family:Georgia,serif}
	.btn{display:inline-block;border:1px solid var(--line);background:#fff;border-radius:10px;padding:13px 20px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;color:var(--ink)}
	.btn.primary{background:var(--cta);color:#fff;border-color:var(--cta);width:100%;margin-top:16px;font-size:18px}
	.notice{border-radius:12px;padding:16px 18px;margin-bottom:14px}
	.notice.ok{background:#E8EFEA;border:1px solid var(--brand)}.notice.ok h2{margin:0 0 6px;font:700 22px Georgia,serif;color:var(--brand)}
	ol.next{padding-left:20px;margin:10px 0 0}
	ol.next li{margin-bottom:16px}
	ol.next a{display:inline-block;margin-top:6px;padding:10px 14px;background:#fff;border:1px solid var(--brand);border-radius:9px;text-decoration:none;font-size:14px;color:var(--brand);font-weight:600}
	.notice.err{background:#FEE4E2;border:1px solid #B42318;color:#7A1F17}
	.signed-stamp{background:#fff;border:2px solid var(--brand);border-radius:12px;padding:12px 16px;margin-bottom:12px}
	.sigblock{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:14px}
	.sigblock table{border-collapse:collapse;width:100%;font-size:15px}.sigblock td,.sigblock th{border:1px solid var(--line);padding:7px 9px;text-align:left}
	.sigblock .sig{font:italic 20px Georgia,serif;color:var(--brand)}.sigblock .ini{font-weight:700;text-align:center;width:60px}
	.sigblock .audit{font-size:12px;color:var(--muted);margin-top:12px;word-break:break-all}
	.print-row{text-align:right}
	@media print{body{background:#fff}header,.print-row,.notice{display:none}main{max-width:none;padding:0}.agreement,.sigblock,.signed-stamp{border:0;padding:0}}
</style>
</head><body>
<header><h1>DFW Crashpads</h1></header>
<main><?php echo $inner; ?></main>
</body></html><?php
}

/* =========================================================
 * 5. Admin: agreement record view and list
 * ======================================================= */
function dfw_agr_record_box() {
	add_meta_box( 'dfw_agr_record', 'Agreement record', 'dfw_agr_record_box_html', 'dfw_agreement', 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'dfw_agr_record_box' );

function dfw_agr_record_box_html( $post ) {
	$m = function ( $k ) use ( $post ) { return get_post_meta( $post->ID, 'dfw_agr_' . $k, true ); };
	$url = dfw_agr_url( $m( 'token' ) );
	$rows = array(
		'Status'        => ucfirst( $m( 'status' ) ),
		'Guest'         => $m( 'name' ) . ' &middot; ' . $m( 'email' ) . ' &middot; ' . $m( 'phone' ),
		'Bed'           => $m( 'category' ) . ( $m( 'bed_id' ) ? ', ' . $m( 'bed_id' ) : '' ) . ' &middot; $' . $m( 'rent' ) . '/mo &middot; code ' . ( $m( 'code' ) ?: 'n/a' ),
		'Move-in'       => $m( 'move_in' ),
		'Sent'          => $m( 'sent_at' ) . ( $m( 'last_emailed' ) ? ' (last emailed ' . $m( 'last_emailed' ) . ')' : '' ),
		'Signed'        => $m( 'signed_at' ) ? $m( 'signed_at' ) . ' as "' . $m( 'signed_name' ) . '" from ' . $m( 'ip' ) : 'Not yet',
		'Fingerprint'   => $m( 'hash' ) ?: '-',
		'Sheet sync'    => $m( 'sheet_status' ) ?: '-',
		'Link'          => '<a href="' . esc_url( $url ) . '" target="_blank">' . esc_html( $url ) . '</a>',
	);
	echo '<table class="widefat striped">';
	foreach ( $rows as $k => $v ) {
		echo '<tr><th style="width:130px">' . esc_html( $k ) . '</th><td>' . wp_kses_post( $v ) . '</td></tr>';
	}
	echo '</table>';
	if ( $m( 'lead_id' ) ) {
		echo '<p><a href="' . esc_url( get_edit_post_link( (int) $m( 'lead_id' ) ) ) . '">Back to the application</a></p>';
	}
}

function dfw_agr_columns( $c ) {
	return array( 'cb' => $c['cb'], 'title' => 'Agreement', 'agr_status' => 'Status', 'agr_movein' => 'Move-in', 'agr_signed' => 'Signed', 'date' => 'Sent' );
}
add_filter( 'manage_dfw_agreement_posts_columns', 'dfw_agr_columns' );

function dfw_agr_column_values( $col, $id ) {
	if ( 'agr_status' === $col ) {
		$s = get_post_meta( $id, 'dfw_agr_status', true );
		echo 'signed' === $s ? '<span style="color:#1F7A46;font-weight:600">Signed</span>' : '<span style="color:#B54708">Waiting</span>';
	} elseif ( 'agr_movein' === $col ) {
		echo esc_html( get_post_meta( $id, 'dfw_agr_move_in', true ) );
	} elseif ( 'agr_signed' === $col ) {
		echo esc_html( get_post_meta( $id, 'dfw_agr_signed_at', true ) ?: '-' );
	}
}
add_action( 'manage_dfw_agreement_posts_custom_column', 'dfw_agr_column_values', 10, 2 );

/** Show agreement status on the Applications list too. */
function dfw_agr_lead_status_col( $cols ) {
	$out = array();
	foreach ( $cols as $k => $v ) {
		$out[ $k ] = $v;
		if ( 'title' === $k ) { $out['agr'] = 'Agreement'; }
	}
	return $out;
}
add_filter( 'manage_dfw_lead_posts_columns', 'dfw_agr_lead_status_col', 20 );

function dfw_agr_lead_status_val( $col, $id ) {
	if ( 'agr' !== $col ) { return; }
	$a = dfw_agr_for_lead( $id );
	if ( ! $a ) { echo '<span style="color:#888">Not sent</span>'; return; }
	$s = get_post_meta( $a->ID, 'dfw_agr_status', true );
	echo 'signed' === $s ? '<span style="color:#1F7A46;font-weight:600">Signed</span>' : '<span style="color:#B54708">Sent, waiting</span>';
}
add_action( 'manage_dfw_lead_posts_custom_column', 'dfw_agr_lead_status_val', 10, 2 );

/* =========================================================
 * 6. Create the template page on activation
 * ======================================================= */
/** Plugin updates that must touch the stored template page (it is a copy, not the PHP fallback). */
function dfw_agr_upgrade() {
	if ( get_option( 'dfw_agr_tpl_rev' ) === '2' ) { return; }
	$tpl_id = (int) get_option( 'dfw_agr_template_page' );
	$tpl    = $tpl_id ? get_post( $tpl_id ) : null;
	if ( $tpl ) {
		$old = 'charged at the monthly rent divided by 30 for each day. The next full month';
		if ( false !== strpos( $tpl->post_content, $old ) ) {
			$new = str_replace(
				'If Guest moves in after the 1st, the first payment covers the move-in date through the end of that month, charged at the monthly rent divided by 30 for each day. The next full month',
				'If Guest moves in after the 1st, Manager may, at Manager\'s discretion, prorate the first month at the monthly rent divided by 30 for each day from the move-in date through the end of that month. Unless Manager confirms a prorated amount in writing before move-in, the full monthly rent is due for the first month. The next full month',
				$tpl->post_content
			);
			wp_update_post( array( 'ID' => $tpl->ID, 'post_content' => $new ) );
		}
	}
	update_option( 'dfw_agr_tpl_rev', '2' );
}
add_action( 'admin_init', 'dfw_agr_upgrade' );

function dfw_agr_install() {
	dfw_agr_register_type();
	$existing = (int) get_option( 'dfw_agr_template_page' );
	if ( $existing && get_post( $existing ) ) {
		return;
	}
	$id = wp_insert_post( array(
		'post_type'    => 'page',
		'post_status'  => 'private',
		'post_title'   => 'Crashpad Agreement Template',
		'post_name'    => 'crashpad-agreement-template',
		'post_content' => dfw_agr_template_html(),
	) );
	if ( $id ) {
		update_option( 'dfw_agr_template_page', $id );
	}
	if ( ! get_option( 'dfw_agr_fee' ) ) { update_option( 'dfw_agr_fee', 150 ); }
	if ( ! get_option( 'dfw_agr_manager_name' ) ) { update_option( 'dfw_agr_manager_name', 'Chad Cooper' ); }
}

/** The agreement as an editable page. Merge tags in double braces. */
function dfw_agr_template_html() {
	return <<<'HTML'
<h1>DFW Crashpads Agreement and House Rules</h1>
<p>This Agreement is between <strong>DFW Crashpads, LLC</strong>, a limited liability company (the "Manager"), and the guest named below (the "Guest"). It becomes effective when both parties sign.</p>
<table><tr><th colspan="2">Guest information</th></tr>
<tr><th>Full name</th><td>{{guest_name}}</td></tr>
<tr><th>Email (used for door app access)</th><td>{{guest_email}}</td></tr>
<tr><th>Mobile phone</th><td>{{guest_phone}}</td></tr>
<tr><th>Airline and position</th><td>{{airline}}</td></tr></table>
<table><tr><th colspan="2">Bed assignment</th></tr>
<tr><th>Bed category</th><td>{{bed_category}}</td></tr>
<tr><th>Bed ID</th><td>{{bed_id}}</td></tr>
<tr><th>Monthly rent</th><td>${{rent}}</td></tr>
<tr><th>Move-in date</th><td>{{move_in}}</td></tr>
<tr><th>Payment code (put this in every payment note)</th><td>{{payment_code}}</td></tr></table>

<h2>Part 1: Parties, Bed, and Term</h2>
<p><strong>1.1 Property.</strong> Manager provides Guest the use of one assigned bed, plus shared use of the common areas, at 3117 Story Lane, Bedford, TX 76021 (the "Property"). The bed is a cold bed: only Guest sleeps in it. Guest does not receive exclusive use of any room or common area.</p>
<p><strong>1.2 Minimum term.</strong> The first term begins on the move-in date shown above and ends on the last day of the first full calendar month after the move-in date. After that, this Agreement continues month to month until either party ends it under Section 1.4.</p>
<p><strong>1.3 Statutory early termination rights.</strong> <strong><u>Tenants may have special statutory rights to terminate the lease early in certain situations involving family violence, certain sexual offenses or stalking, or a military deployment or transfer.</u></strong></p>
<p><strong>1.4 Ending the Agreement.</strong> Either party may end this Agreement by written notice sent by email or by text message to the Manager's business number no later than the 15th day of a calendar month. The Agreement then ends on the last day of that month. Notice received after the 15th takes effect at the end of the following month. <strong>Airline schedule exception:</strong> if Guest's airline releases the schedule, bid award, base change, or reassignment that causes the move-out after the 15th, Guest must notify Manager within 48 hours of receiving it. If Guest does, the notice takes effect at the end of the current month as if given on time. Guest agrees to tell Manager about a likely move-out as soon as Guest knows, even before it is final. Guest sends notice by email to {{manager_email}} or by text message to {{manager_phone}}. Manager confirms receipt in writing. Notice sent to any other number or app does not count. Manager may also end the Agreement early as allowed by Texas law, including for serious violations under the House Rules.</p>
<p><strong>1.5 Move-out.</strong> On the last day, Guest removes all personal items and food, leaves the bed linens on the bed for the cleaners, and confirms move-out to Manager by text or email.</p>

<h2>Part 2: Rent and Payment</h2>
<p><strong>2.1 Rent.</strong> Guest pays the monthly rent shown above, due on the 1st day of each month. Rent does not increase during the first term. After that, Manager may change the rent with at least 30 days' written notice.</p>
<p><strong>2.2 First month.</strong> If Guest moves in after the 1st, Manager may, at Manager's discretion, prorate the first month at the monthly rent divided by 30 for each day from the move-in date through the end of that month. Unless Manager confirms a prorated amount in writing before move-in, the full monthly rent is due for the first month. The next full month's rent is due on the 1st as usual.</p>
<p><strong>2.3 How to pay.</strong> Guest may pay by Zelle, Apple Pay (Apple Cash), Venmo, PayPal, or Cash App, using the payment details Manager provides. Zelle and Apple Pay are preferred. <strong>Guest must include the payment code shown above in the note of every payment.</strong> A payment counts as received on the day it arrives in Manager's account. Guest pays any fees charged by the payment service Guest chooses.</p>
<p><strong>2.4 Late fee.</strong> If any part of the rent is still unpaid at 11:59 PM on the 5th day of the month, Guest owes an initial late fee of $10 on the 6th, plus $5 for each additional day the rent remains unpaid. <strong>The total late fee for any one month will never be more than 12% of that month's rent.</strong> Manager will send a reminder before any late fee is charged.</p>
<p><strong>2.5 Other charges.</strong> Guest pays for damage Guest causes beyond normal wear and tear, and for replacement of lost or damaged linens or items provided by Manager.</p>

<h2>Part 3: Reservation Fee</h2>
<p><strong>3.1 Amount.</strong> Guest pays a ${{reservation_fee}} reservation fee to hold the assigned bed, or a bed in the chosen category, from the start date shown above. The start date may be in a future month. Manager holds the bed once the signed Agreement and fee are received. Texas law treats this fee as a security deposit, and Manager follows the security deposit rules in Chapter 92 of the Texas Property Code. <strong><u>The reservation fee is not refundable until Guest has paid rent for and completed the first full calendar month after the move-in date. After that, it is refunded when Guest moves out with notice under Section 1.4, including the airline schedule exception. If Guest cancels before the start date, or before paying the first month's rent, the reservation fee is not refunded.</u></strong></p>
<p><strong>3.2 Notice required for full refund.</strong> <strong><u>To receive the reservation fee back, Guest must give written notice of move-out by email to {{manager_email}} or by text message to {{manager_phone}} no later than the 15th day of Guest's final month. If Guest does not give this advance notice, Manager may keep the reservation fee, unless Guest qualifies for the airline schedule exception in Section 1.4.</u></strong></p>
<p><strong>3.3 Refund.</strong> Manager refunds the reservation fee within 30 days after Guest moves out, minus any unpaid rent, late fees, or charges for damage beyond normal wear and tear. If Manager keeps any part, Manager sends Guest a written, itemized list of deductions. Guest must provide a forwarding address or payment method for the refund in writing.</p>
<p><strong>3.4 Not last month's rent.</strong> Guest may not use the reservation fee as payment for the last month's rent.</p>

<h2>Part 4: Access, Furnishings, and Cleaning</h2>
<p><strong>4.1 Door access.</strong> The Property uses app-controlled smart locks (TTLock). Guest installs the TTLock app and creates an account using the email shown above. Manager sends Guest's door key to that account after receiving the signed Agreement, the reservation fee, and the first rent payment. Access is personal: Guest may not share codes, eKeys, or the app login. Manager deactivates Guest's access after Guest confirms move-out or abandons the Property. If Guest does not move out, Manager will not deactivate access and will instead proceed through court eviction. Manager rekeys or changes shared entry codes within 7 days after each guest turnover.</p>
<p><strong>4.2 Furnishings and appliances.</strong> Manager provides a furnished home, including stove, dishwasher, refrigerator, microwave, washer, dryer, iron, and ironing board. Guest receives designated pantry and refrigerator space.</p>
<p><strong>4.3 Bed and linens.</strong> Manager provides the bed with an 8-inch memory foam mattress, one pillow, sheets, a blanket, and a towel, cleaned and made before move-in. During the stay, Guest keeps the bed made and launders the provided linens. Guest supplies laundry detergent.</p>
<p><strong>4.4 Cleaning.</strong> A professional cleaning service cleans the common areas weekly. Guest cleans up after himself right away, including dishes, spills, and the bathroom after each use.</p>
<p><strong>4.5 Parking.</strong> The Property has off-street parking for up to seven vehicles, shared first come, first served. No space is assigned or guaranteed. Additional vehicles must park legally on the street. Guest may not block other vehicles.</p>
<p><strong>4.6 Utilities and services.</strong> Manager pays all utilities, Wi-Fi, and included streaming services.</p>

<h2>Part 5: Repairs, Entry, and Legal Terms</h2>
<p><strong>5.1 Repairs.</strong> Manager keeps the Property in good repair. Guest reports repair needs in writing to {{manager_email}}. For emergencies (fire, flooding, gas, lockout, no heat in winter), Guest calls or texts {{manager_phone}} at any hour.</p>
<p><strong>5.2 Tenant repair remedies.</strong> <strong><u>If Manager fails to repair a condition that materially affects the physical health or safety of an ordinary tenant as required by this Agreement or the Texas Property Code, Guest may be entitled to exercise remedies under Texas Property Code Sections 92.056 and 92.0561. If Guest follows the procedures under those sections, the following remedies may be available to Guest: (1) terminate the Agreement and obtain a pro rata refund of rent under Section 92.056(f); (2) have the condition repaired or remedied according to Section 92.0561; (3) deduct from the rent, without necessity of judicial action, the cost of the repair or remedy according to Section 92.0561; and (4) obtain judicial remedies according to Section 92.0563. Guest should not exercise these remedies without carefully reading the law or consulting an attorney, because following the procedures incorrectly may result in liability to Manager.</u></strong></p>
<p><strong>5.3 Manager entry.</strong> Manager and Manager's agents, including cleaners and repair workers, may enter the Property at reasonable times to clean, inspect, make repairs, show beds to prospective guests, or respond to an emergency.</p>
<p><strong>5.4 Occupants and visitors.</strong> Only guests with a signed agreement may stay overnight. Visitors must follow the House Rules.</p>
<p><strong>5.5 No subletting or assignment.</strong> Guest may not assign this Agreement, sublet the bed, or allow anyone else to use it.</p>
<p><strong>5.6 Use of Property.</strong> Guest uses the Property only as shared, part-time secondary housing while commuting for work.</p>
<p><strong>5.7 Smoking and hazardous items.</strong> No smoking or vaping inside. Guest may not keep dangerous, flammable, or explosive items at the Property.</p>
<p><strong>5.8 Guest's belongings and insurance.</strong> Manager does not insure Guest's belongings or cover Guest's personal injury. Guest is encouraged to carry renters insurance. Manager is not liable for loss or damage to Guest's property from theft, fire, water, or other causes, unless caused by Manager's negligence.</p>
<p><strong>5.9 Property left behind.</strong> Manager is not responsible for storing or shipping items left behind. Items left more than 7 days after move-out are considered abandoned, and Manager may discard or donate them. Food may be discarded immediately.</p>
<p><strong>5.10 Indemnity.</strong> To the extent allowed by law, Guest will cover Manager's losses, claims, and reasonable attorney's fees caused by Guest's use or misuse of the Property, except those caused by Manager's own act or negligence.</p>
<p><strong>5.11 Attorney's fees.</strong> In any lawsuit between the parties arising out of this Agreement, including an eviction, the prevailing party may recover its reasonable attorney's fees and court costs from the other party.</p>
<p><strong>5.12 Fair housing.</strong> Manager complies with applicable fair housing laws. Guest understands the Property is a shared living space with shared bedrooms and bathrooms.</p>
<p><strong>5.13 Governing law.</strong> Texas law governs this Agreement.</p>
<p><strong>5.14 Waiver of jury trial.</strong> <strong><u>TO THE EXTENT ALLOWED BY LAW, GUEST AND MANAGER KNOWINGLY AND VOLUNTARILY AGREE THAT ANY LAWSUIT RELATED TO THIS AGREEMENT WILL BE DECIDED BY A JUDGE AND NOT A JURY.</u></strong></p>
<p><strong>5.15 Force majeure.</strong> Neither party is responsible for failing to perform because of events beyond its control, such as natural disasters, epidemics, or government orders. This section does not excuse payment of rent or other money owed.</p>
<p><strong>5.16 Electronic signatures and notices.</strong> Guest agrees to sign this Agreement electronically and to receive notices by email and text, including notices to vacate. An electronic signature has the same effect as a handwritten one.</p>
<p><strong>5.17 Entire agreement.</strong> This Agreement, including the House Rules, is the entire agreement between the parties. Changes must be in writing and signed by both parties. If any part is found unenforceable, the rest remains in effect.</p>
<p><strong>5.18 Binding effect.</strong> This Agreement binds the parties and their legal representatives and successors. Guest may not assign it, as stated in Section 5.5.</p>

<h2>House Rules</h2>
<p>These rules are part of the Agreement. Guest initials each rule when signing.</p>
<ol>
<li><strong>Airline crew only.</strong> Guest must be employed by a commercial airline and must tell Manager if that changes.</li>
<li><strong>Commuter housing.</strong> The crashpad is secondary housing, not Guest's main residence. Guest keeps a separate permanent residence. Storage is limited to one suitcase and one storage bin, labeled with Guest's name, plus normal trip luggage. Guest does not receive mail or packages at the Property.</li>
<li><strong>Professional atmosphere.</strong> Treat housemates with respect. No drunkenness, parties, or drama. Guests who snore loudly are asked to take reasonable steps to reduce it, such as nasal strips or a mouthguard. If it continues to disturb others, Manager and Guest will discuss reasonable options, which may include reassigning the bed.</li>
<li><strong>Quiet time: 9 PM to 9 AM.</strong> Keep TV, calls, and conversation low. Many housemates sleep during the day before early reports, so be considerate at all hours.</li>
<li><strong>Visitors and bedrooms.</strong> Visitors must leave before quiet time and may never stay overnight. Visitors are not allowed in bedroom areas at any time. Guest is responsible for visitors' behavior. Guests may enter only the bedroom containing their assigned bed, except in an emergency.</li>
<li><strong>Cleanliness.</strong> Wash, dry, and put away dishes right after use. Nothing is left in the sink or on the counter. Wipe down the bathroom after each use. Help with shared tasks. <strong>Trash and recycling:</strong> trash pickup is Tuesday and Friday, recycling pickup is Friday. When a kitchen or bathroom can is full, whoever notices takes the bag to the outdoor can and puts in a new bag. Only normal household trash goes in the bags. On pickup days, guests take the outdoor cans to the curb and bring them back in after pickup.</li>
<li><strong>Sleep only in your bed.</strong> No sleeping on couches or in another guest's bed, including naps.</li>
<li><strong>No smoking or vaping indoors.</strong></li>
<li><strong>No illegal activity</strong> at the Property.</li>
<li><strong>Door security.</strong> Keep exterior doors locked. Do not share door codes or app access. Report lock problems right away. The smart locks keep a log of who unlocks the door and when; Manager uses it for security and to plan cleaning.</li>
</ol>
<p><strong>Rule violations.</strong> A first violation results in a written warning by email. A second violation results in written notice that the Agreement will end under Section 1.4, and the bed will not be renewed. Serious violations, such as illegal activity, violence, or threats to others' safety, may result in ending the Agreement sooner as allowed by Texas law. Any deductions from the reservation fee follow Part 3.</p>
HTML;
}
