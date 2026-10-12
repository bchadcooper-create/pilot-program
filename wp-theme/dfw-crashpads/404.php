<?php get_header(); ?>
<div class="page-content">
	<div class="wrap entry">
		<h1><?php esc_html_e( 'That page is not here.', 'dfw-crashpads' ); ?></h1>
		<p><?php esc_html_e( 'The link may be old. Head back to the homepage to see rooms, pricing, and how to apply.', 'dfw-crashpads' ); ?></p>
		<a class="btn btn-cta" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Go to homepage', 'dfw-crashpads' ); ?></a>
	</div>
</div>
<?php get_footer(); ?>
