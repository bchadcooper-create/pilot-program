<?php
/**
 * Homepage.
 *
 * @package DFW_Crashpads
 */

get_header();

$home  = home_url( '/' );
$fee   = (int) dfw_mod( 'dfw_fee' );
$rooms = array(
	'top'     => array( __( 'Top bunk', 'dfw-crashpads' ), 'bunks.jpg', 'center 15%' ),
	'bottom'  => array( __( 'Bottom bunk', 'dfw-crashpads' ), 'bunks.jpg', 'center 85%' ),
	'semi'    => array( __( 'Semi-private', 'dfw-crashpads' ), 'semi-private.jpg', 'center 70%' ),
	'private' => array( __( 'Private', 'dfw-crashpads' ), '', 'center' ),
);
$lowest = min( (int) dfw_mod( 'dfw_price_top' ), (int) dfw_mod( 'dfw_price_bottom' ), (int) dfw_mod( 'dfw_price_semi' ), (int) dfw_mod( 'dfw_price_private' ) );
$rating = dfw_mod( 'dfw_google_rating' );
$count  = (int) dfw_mod( 'dfw_google_count' );
?>

<section class="hero" id="top">
	<div class="wrap">
		<div>
			<p class="hero-kicker"><?php echo esc_html( dfw_mod( 'dfw_hero_kicker' ) ); ?></p>
			<h1><?php echo esc_html( dfw_mod( 'dfw_hero_title' ) ); ?></h1>
			<p class="hero-text"><?php echo esc_html( dfw_mod( 'dfw_hero_text' ) ); ?></p>
			<div class="hero-actions">
				<a class="btn btn-cta" href="#apply"><?php esc_html_e( 'Check Availability', 'dfw-crashpads' ); ?></a>
				<a class="btn btn-outline" href="#rooms"><?php esc_html_e( 'See Pricing', 'dfw-crashpads' ); ?></a>
			</div>
			<?php if ( $count > 0 ) : ?>
				<div class="hero-rating"><?php echo dfw_stars(); ?><span><strong><?php echo esc_html( $rating ); ?> on Google</strong> <?php printf( esc_html__( 'from %d reviews', 'dfw-crashpads' ), $count ); ?></span></div>
			<?php endif; ?>
			<p class="hero-note"><?php printf( esc_html__( 'Beds from $%d a month.', 'dfw-crashpads' ), $lowest ); ?> <?php echo dfw_contact_link( 'tel', sprintf( __( 'Call or text %s', 'dfw-crashpads' ), dfw_phone_display() ) ); ?></p>
		</div>
		<div class="hero-image"><?php echo dfw_img( 'dfw_hero_image', 'living-kitchen.jpg', __( 'Open kitchen and living room at the crashpad', 'dfw-crashpads' ), array( 'priority' => true, 'width' => 1000, 'height' => 750, 'sizes' => DFW_HERO_SIZES ) ); ?></div>
	</div>
</section>

<section class="facts" aria-label="<?php esc_attr_e( 'Quick facts', 'dfw-crashpads' ); ?>">
	<div class="wrap">
		<ul>
			<li><?php esc_html_e( '7.5 miles to DFW', 'dfw-crashpads' ); ?></li>
			<li><?php esc_html_e( 'Cold beds only', 'dfw-crashpads' ); ?></li>
			<li><?php esc_html_e( 'Cleaned every week', 'dfw-crashpads' ); ?></li>
			<li><?php esc_html_e( 'Parking for 7 cars', 'dfw-crashpads' ); ?></li>
		</ul>
	</div>
</section>

<section class="section">
	<div class="wrap">
		<h2 class="section-title"><?php esc_html_e( 'Built for the commute', 'dfw-crashpads' ); ?></h2>
		<div class="pillars">
			<div class="pillar">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
				<h3><?php esc_html_e( 'Close', 'dfw-crashpads' ); ?></h3>
				<p><?php esc_html_e( '7.5 miles to DFW Airport, with room to park your own car at the house.', 'dfw-crashpads' ); ?></p>
			</div>
			<div class="pillar">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>
				<h3><?php esc_html_e( 'Clean', 'dfw-crashpads' ); ?></h3>
				<p><?php esc_html_e( 'Professional cleaners every week for the kitchen, bathrooms, and living areas. Your bed is prepped before you arrive.', 'dfw-crashpads' ); ?></p>
			</div>
			<div class="pillar">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18V8"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="11" r="1.5"/></svg>
				<h3><?php esc_html_e( 'Comfortable', 'dfw-crashpads' ); ?></h3>
				<p><?php esc_html_e( '8-inch memory foam mattresses. Pillow, sheets, blanket, and towel provided, so you can travel light.', 'dfw-crashpads' ); ?></p>
			</div>
			<div class="pillar">
				<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><rect x="10" y="11" width="4" height="4" rx="0.8"/><path d="M10.8 11V9.8a1.2 1.2 0 0 1 2.4 0V11"/></svg>
				<h3><?php esc_html_e( 'Convenient', 'dfw-crashpads' ); ?></h3>
				<p><?php esc_html_e( 'No keys to lose. Unlock the front door with an app on your phone, any hour your trip ends.', 'dfw-crashpads' ); ?></p>
			</div>
		</div>
	</div>
</section>

<section class="section section-white" id="rooms">
	<div class="wrap">
		<div class="rooms-head">
			<div>
				<h2><?php esc_html_e( 'Rooms & pricing', 'dfw-crashpads' ); ?></h2>
				<p class="lead"><?php printf( esc_html__( 'Every bed is a cold bed: it is yours for your whole stay and no one else sleeps in it. One-month minimum, then month to month. $%d reservation fee, refundable after your first month.', 'dfw-crashpads' ), $fee ); ?></p>
			</div>
			<a class="btn btn-cta" href="#apply"><?php esc_html_e( 'Apply for a Bed', 'dfw-crashpads' ); ?></a>
		</div>
		<div class="rooms">
			<?php foreach ( $rooms as $key => $r ) : ?>
				<div class="room">
					<?php
					$url = dfw_mod( 'dfw_img_' . $key );
					if ( ! $url && $r[1] ) {
						$url = get_template_directory_uri() . '/assets/img/' . $r[1];
					}
					?>
					<?php if ( $url ) : ?>
						<?php echo dfw_picture( $url, $r[0], array( 'style' => 'object-position: ' . $r[2] . ';', 'width' => 450, 'height' => 600, 'sizes' => DFW_ROOM_SIZES ) ); ?>
					<?php else : ?>
						<div class="room-noimg"><?php esc_html_e( 'Photo coming soon', 'dfw-crashpads' ); ?></div>
					<?php endif; ?>
					<div class="room-body">
						<h3><?php echo esc_html( $r[0] ); ?></h3>
						<div class="room-price"><?php esc_html_e( 'From', 'dfw-crashpads' ); ?> <strong>$<?php echo (int) dfw_mod( 'dfw_price_' . $key ); ?></strong> /month</div>
						<p class="room-desc"><?php echo esc_html( dfw_mod( 'dfw_desc_' . $key ) ); ?></p>
						<?php echo dfw_availability_pill( $key ); ?>
					</div>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="section" id="amenities">
	<div class="wrap two-col">
		<div>
			<h2 class="section-title"><?php esc_html_e( "What's included", 'dfw-crashpads' ); ?></h2>
			<ul class="amenities">
				<?php foreach ( array_filter( array_map( 'trim', explode( "\n", get_theme_mod( 'dfw_amenities', "Wi-Fi and streaming TV\nTwo living rooms\nFull kitchen, your own pantry and fridge space\nFree washer and dryer\nIron and ironing board\nAll utilities\nWeekly professional cleaning\nParking for up to 7 cars, more on the street\nGroceries within walking distance\nBike and jogging trails nearby" ) ) ) ) as $item ) : ?>
					<li><?php echo esc_html( $item ); ?></li>
				<?php endforeach; ?>
			</ul>
		</div>
		<div>
			<h2 class="section-title"><?php esc_html_e( 'How to get a bed', 'dfw-crashpads' ); ?></h2>
			<ol class="steps">
				<li><span><strong><?php esc_html_e( 'Apply online.', 'dfw-crashpads' ); ?></strong> <?php esc_html_e( 'Takes about two minutes.', 'dfw-crashpads' ); ?></span></li>
				<li><span><strong><?php esc_html_e( 'Quick phone call.', 'dfw-crashpads' ); ?></strong> <?php esc_html_e( 'We text you to set a time.', 'dfw-crashpads' ); ?></span></li>
				<li><span><strong><?php printf( esc_html__( 'Sign online and pay the $%d reservation fee.', 'dfw-crashpads' ), $fee ); ?></strong> <?php esc_html_e( 'Your bed is held.', 'dfw-crashpads' ); ?></span></li>
				<li><span><strong><?php esc_html_e( 'Get door access on your phone.', 'dfw-crashpads' ); ?></strong> <?php esc_html_e( 'Your bed is made when you arrive.', 'dfw-crashpads' ); ?></span></li>
			</ol>
		</div>
	</div>
</section>

<section class="section" style="padding-top: 0;">
	<div class="wrap">
		<h2 class="section-title"><?php esc_html_e( 'Inside the house', 'dfw-crashpads' ); ?></h2>
		<div class="gallery">
			<?php echo dfw_img( 'dfw_gallery_1', 'living-2.jpg', __( 'Second living room with sofas', 'dfw-crashpads' ), array( 'width' => 800, 'height' => 600, 'sizes' => DFW_GALLERY_SIZES ) ); ?>
			<?php echo dfw_img( 'dfw_gallery_2', 'front-room.jpg', __( 'Dining table and front living room', 'dfw-crashpads' ), array( 'width' => 600, 'height' => 800, 'sizes' => DFW_GALLERY_SIZES ) ); ?>
			<?php echo dfw_img( 'dfw_gallery_3', 'bathroom.jpg', __( 'Clean bathroom with vanity and shower', 'dfw-crashpads' ), array( 'width' => 600, 'height' => 800, 'sizes' => DFW_GALLERY_SIZES ) ); ?>
		</div>
	</div>
</section>

<section class="section section-tint" id="reviews">
	<div class="wrap">
		<h2 class="section-title"><?php esc_html_e( 'From crew who stayed here', 'dfw-crashpads' ); ?></h2>
		<?php if ( $count > 0 ) : ?>
			<div class="reviews-rating"><?php echo dfw_stars(); ?><span><strong><?php echo esc_html( $rating ); ?> on Google</strong> <?php printf( esc_html__( 'from %d reviews', 'dfw-crashpads' ), $count ); ?></span></div>
		<?php endif; ?>
		<div class="reviews">
			<?php for ( $i = 1; $i <= 3; $i++ ) : ?>
				<?php $text = dfw_mod( 'dfw_review_' . $i . '_text' ); if ( ! $text ) { continue; } ?>
				<figure class="review">
					<blockquote><?php echo esc_html( $text ); ?></blockquote>
					<figcaption><?php echo esc_html( dfw_mod( 'dfw_review_' . $i . '_name' ) ); ?></figcaption>
				</figure>
			<?php endfor; ?>
		</div>
		<?php if ( dfw_mod( 'dfw_google_url' ) ) : ?>
			<p class="reviews-link"><a href="<?php echo esc_url( dfw_mod( 'dfw_google_url' ) ); ?>" rel="noopener"><?php esc_html_e( 'Read all reviews on Google', 'dfw-crashpads' ); ?></a></p>
		<?php endif; ?>
	</div>
</section>

<section class="section" id="faq">
	<div class="wrap two-col">
		<div>
			<h2><?php esc_html_e( 'Quick answers', 'dfw-crashpads' ); ?></h2>
			<p class="lead"><?php esc_html_e( 'Still have a question?', 'dfw-crashpads' ); ?> <?php echo dfw_contact_link( 'tel', sprintf( __( 'Call or text %s', 'dfw-crashpads' ), dfw_phone_display() ) ); ?></p>
			<?php $faq_page = get_page_by_path( 'faq' ); if ( $faq_page ) : ?>
				<p><a href="<?php echo esc_url( get_permalink( $faq_page ) ); ?>"><?php esc_html_e( 'See all questions', 'dfw-crashpads' ); ?></a></p>
			<?php endif; ?>
		</div>
		<div class="faq">
			<?php foreach ( dfw_faq_items() as $qa ) : ?>
			<details><summary><?php echo esc_html( $qa[0] ); ?></summary><p><?php echo esc_html( $qa[1] ); ?></p></details>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="section section-white" id="apply">
	<div class="wrap two-col">
		<div>
			<h2><?php esc_html_e( 'Apply for a bed', 'dfw-crashpads' ); ?></h2>
			<p class="lead"><?php echo esc_html( dfw_mod( 'dfw_apply_intro' ) ); ?> <?php echo dfw_contact_link( 'tel' ); ?></p>
			<div class="who-for"><strong><?php esc_html_e( 'Who this pad is for:', 'dfw-crashpads' ); ?></strong> <?php echo esc_html( dfw_mod( 'dfw_who_for' ) ); ?></div>
		</div>
		<div>
			<?php
			if ( shortcode_exists( 'dfw_application_form' ) ) {
				echo do_shortcode( '[dfw_application_form]' );
			} else {
				echo '<div class="form-success"><p>' . esc_html__( 'To apply,', 'dfw-crashpads' ) . ' ' . dfw_contact_link( 'tel', sprintf( __( 'call or text %s', 'dfw-crashpads' ), dfw_phone_display() ) ) . '.</p><p><em>' . esc_html__( 'Site owner: activate the DFW Crashpads Core plugin to show the application form here.', 'dfw-crashpads' ) . '</em></p></div>';
			}
			?>
		</div>
	</div>
</section>

<?php get_footer(); ?>
