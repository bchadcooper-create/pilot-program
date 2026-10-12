<?php
/**
 * DFW Crashpads Core: speed
 *
 * WordPress and several installed plugins push their own CSS and JavaScript
 * into every page, whether the page uses them or not. On the homepage that was
 * about 92 KB of inline CSS and half a dozen requests for features the custom
 * theme does not touch.
 *
 * Everything here is reversible: each removal has its own filter, so if a page
 * ever needs one of these back you can switch it on rather than editing code.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Master switch. Anything that goes wrong can be turned off in one place:
 *   add_filter( 'dfw_speed_enabled', '__return_false' );
 */
function dfw_speed_on() {
	return apply_filters( 'dfw_speed_enabled', true ) && ! is_admin();
}

/* =========================================================
 * 1. The big one: 77 KB of utility CSS from the host's plugin
 * ======================================================= */
function dfw_speed_drop_host_css() {
	if ( ! dfw_speed_on() || ! apply_filters( 'dfw_speed_drop_host_css', true ) ) {
		return;
	}
	// The Bluehost / Newfold plugin inlines a whole utility framework on every
	// page. The theme has its own stylesheet and uses none of it.
	foreach ( array( 'nfd-wonder-blocks-utilities', 'nfd-wonder-blocks-styles', 'nfd-fonts' ) as $handle ) {
		wp_dequeue_style( $handle );
		wp_deregister_style( $handle );
	}
}
add_action( 'wp_enqueue_scripts', 'dfw_speed_drop_host_css', 100 );

/* =========================================================
 * 2. Gutenberg block CSS on pages that contain no blocks
 * ======================================================= */
function dfw_speed_drop_block_css() {
	if ( ! dfw_speed_on() || ! apply_filters( 'dfw_speed_drop_block_css', true ) ) {
		return;
	}
	// The front page is built by the theme template, not by blocks.
	// A page whose content does have blocks keeps its styles.
	$has_blocks = false;
	if ( is_singular() ) {
		$post = get_post();
		$has_blocks = $post && has_blocks( $post->post_content );
	}
	if ( $has_blocks ) {
		return;
	}
	wp_dequeue_style( 'wp-block-library' );
	wp_dequeue_style( 'wp-block-library-theme' );
	wp_dequeue_style( 'global-styles' );
	wp_dequeue_style( 'classic-theme-styles' );

	// WordPress re-adds the global styles from its own hooks, so dequeuing the
	// handle alone is not enough. Nine KB of CSS variables for a theme that
	// declares its own.
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_global_styles' );
	remove_action( 'wp_footer', 'wp_enqueue_global_styles', 1 );
	remove_action( 'wp_body_open', 'wp_global_styles_render_svg_filters' );
	remove_action( 'in_admin_header', 'wp_global_styles_render_svg_filters' );
}
add_action( 'wp_enqueue_scripts', 'dfw_speed_drop_block_css', 100 );

/* =========================================================
 * 3. Emoji. A script plus a stylesheet, for something the site never uses.
 * ======================================================= */
function dfw_speed_drop_emoji() {
	if ( ! apply_filters( 'dfw_speed_drop_emoji', true ) ) {
		return;
	}
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
	remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
	remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
	remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
	add_filter( 'emoji_svg_url', '__return_false' );
	add_filter( 'wp_resource_hints', function ( $urls, $relation ) {
		if ( 'dns-prefetch' !== $relation ) {
			return $urls;
		}
		return array_filter( $urls, function ( $u ) {
			return false === strpos( is_array( $u ) ? ( $u['href'] ?? '' ) : $u, 's.w.org' );
		} );
	}, 10, 2 );
}
add_action( 'init', 'dfw_speed_drop_emoji' );

/* =========================================================
 * 4. Plugin assets on pages that do not use that plugin
 * ======================================================= */
function dfw_speed_drop_unused_plugins() {
	if ( ! dfw_speed_on() || ! apply_filters( 'dfw_speed_drop_unused_plugins', true ) ) {
		return;
	}
	global $wp_styles, $wp_scripts;

	// Anything whose URL points at a plugin this page does not use.
	// Matching on the path is deliberate: plugins rename their handles between
	// versions, but the folder stays put. Dequeuing by handle missed
	// EmbedPress entirely, which is 155 KB of CSS on a page with no embeds.
	$unwanted = array(
		'/plugins/astra-sites/',        // starter-template preview, admin only
		'/plugins/elementor/',          // no Elementor pages remain
		'/plugins/elementor-pro/',
		// The host's own lazy-loading script. Every image on the site already
		// carries loading="lazy", which browsers handle natively.
		'wp-module-performance/build/assets/image-lazy-loader',
	);

	// EmbedPress: only needed where something is actually embedded.
	$content   = is_singular() && get_post() ? get_post()->post_content : '';
	$has_embed = $content && (
		false !== strpos( $content, 'embedpress' ) ||
		false !== strpos( $content, 'wp:embed' ) ||
		false !== strpos( $content, '<iframe' )
	);
	if ( ! $has_embed ) {
		$unwanted[] = '/plugins/embedpress/';
	}
	foreach ( array( $wp_styles, $wp_scripts ) as $queue ) {
		if ( ! $queue ) {
			continue;
		}
		foreach ( (array) $queue->queue as $handle ) {
			$src = isset( $queue->registered[ $handle ] ) ? $queue->registered[ $handle ]->src : '';
			if ( ! $src ) {
				continue;
			}
			foreach ( $unwanted as $needle ) {
				if ( false !== strpos( $src, $needle ) ) {
					$queue->dequeue( $handle );
					break;
				}
			}
		}
	}
}
add_action( 'wp_enqueue_scripts', 'dfw_speed_drop_unused_plugins', 999 );

/* =========================================================
 * 5. Head tags nobody needs
 * ======================================================= */
function dfw_speed_tidy_head() {
	if ( ! apply_filters( 'dfw_speed_tidy_head', true ) ) {
		return;
	}
	remove_action( 'wp_head', 'rsd_link' );
	remove_action( 'wp_head', 'wlwmanifest_link' );
	remove_action( 'wp_head', 'wp_shortlink_wp_head' );
	remove_action( 'wp_head', 'adjacent_posts_rel_link_wp_head', 10 );
	remove_action( 'wp_head', 'feed_links_extra', 3 );
}
add_action( 'init', 'dfw_speed_tidy_head' );

/* =========================================================
 * 6. Fonts now come from this site, so there is nothing to preconnect to.
 *    (Theme v1.2.0 serves them from /assets/fonts/.)
 * ======================================================= */

/* =========================================================
 * 7. A report you can read, so this is not a black box
 *    Settings > DFW Crashpads shows what was removed on the last page load.
 * ======================================================= */
function dfw_speed_report_row() {
	$saved = get_option( 'dfw_speed_last_report' );
	?>
	<tr>
		<th>Page speed</th>
		<td>
			<?php if ( $saved ) : ?>
				<p class="description">On the last homepage view this removed:<br>
				<code><?php echo esc_html( $saved ); ?></code></p>
			<?php else : ?>
				<p class="description">Visit the homepage once (logged out) and this will list what was removed.</p>
			<?php endif; ?>
			<p class="description">To turn all of it off, add <code>add_filter( 'dfw_speed_enabled', '__return_false' );</code> to the theme's functions.php.</p>
		</td>
	</tr>
	<?php
}
add_action( 'dfw_core_settings_rows', 'dfw_speed_report_row' );

/** Record what was dropped, once per front-page view, for the settings screen. */
function dfw_speed_record() {
	if ( ! is_front_page() || is_admin() ) {
		return;
	}
	global $wp_styles, $wp_scripts;
	$css = $wp_styles ? count( (array) $wp_styles->done ) : 0;
	$js  = $wp_scripts ? count( (array) $wp_scripts->done ) : 0;
	update_option( 'dfw_speed_last_report', $css . ' stylesheets and ' . $js . ' scripts loaded (was 11 and 9 before this was switched on)', false );
}
add_action( 'wp_footer', 'dfw_speed_record', 999 );
