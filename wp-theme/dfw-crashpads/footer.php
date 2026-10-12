</main>
<footer class="site-footer">
	<div class="wrap">
		<div>
			<div class="footer-brand"><?php bloginfo( 'name' ); ?></div>
			<div><?php esc_html_e( 'Crew housing near DFW Airport', 'dfw-crashpads' ); ?></div>
		</div>
		<?php $guides = dfw_guide_pages(); if ( $guides ) : ?>
		<div class="footer-guides">
			<div class="footer-brand" style="font-size:inherit"><?php esc_html_e( 'Guides', 'dfw-crashpads' ); ?></div>
			<?php foreach ( $guides as $g ) : ?>
				<a href="<?php echo esc_url( get_permalink( $g ) ); ?>"><?php echo esc_html( get_the_title( $g ) ); ?></a>
			<?php endforeach; ?>
		</div>
		<?php endif; ?>
		<div class="footer-contact">
			<?php echo dfw_contact_link( 'tel', sprintf( __( 'Call or text %s', 'dfw-crashpads' ), dfw_phone_display() ) ); ?>
			<?php echo dfw_contact_link( 'mail' ); ?>
			<?php if ( dfw_mod( 'dfw_facebook' ) ) : ?>
				<a href="<?php echo esc_url( dfw_mod( 'dfw_facebook' ) ); ?>" rel="noopener"><?php esc_html_e( 'Facebook', 'dfw-crashpads' ); ?></a>
			<?php endif; ?>
			<?php wp_nav_menu( array( 'theme_location' => 'footer', 'container' => false, 'items_wrap' => '%3$s', 'depth' => 1, 'fallback_cb' => false, 'walker' => new DFW_Link_Walker() ) ); ?>
		</div>
	</div>
</footer>
<div class="sticky-bar">
	<?php echo dfw_contact_link( 'sms', __( 'Text us', 'dfw-crashpads' ), 'btn btn-outline' ); ?>
	<a class="btn btn-cta" href="<?php echo esc_url( home_url( '/#apply' ) ); ?>"><?php esc_html_e( 'Apply for a Bed', 'dfw-crashpads' ); ?></a>
</div>
<?php wp_footer(); ?>
</body>
</html>
