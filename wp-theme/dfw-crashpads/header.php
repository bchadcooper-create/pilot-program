<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="screen-reader-text" href="#main"><?php esc_html_e( 'Skip to content', 'dfw-crashpads' ); ?></a>
<header class="site-header">
	<div class="wrap">
		<?php if ( has_custom_logo() ) : ?>
			<?php the_custom_logo(); ?>
		<?php else : ?>
			<a class="site-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php bloginfo( 'name' ); ?></a>
		<?php endif; ?>
		<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="<?php esc_attr_e( 'Menu', 'dfw-crashpads' ); ?>">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
		</button>
		<nav id="site-nav" class="site-nav" aria-label="<?php esc_attr_e( 'Main', 'dfw-crashpads' ); ?>">
			<?php
			if ( has_nav_menu( 'primary' ) ) {
				wp_nav_menu( array( 'theme_location' => 'primary', 'container' => false, 'items_wrap' => '%3$s', 'depth' => 1, 'walker' => new DFW_Link_Walker() ) );
			} else {
				dfw_fallback_menu();
			}
			?>
			<?php echo dfw_contact_link( 'tel', '', 'nav-phone' ); ?>
			<a class="btn btn-cta" href="<?php echo esc_url( home_url( '/#apply' ) ); ?>"><?php esc_html_e( 'Apply for a Bed', 'dfw-crashpads' ); ?></a>
		</nav>
	</div>
</header>
<main id="main">
