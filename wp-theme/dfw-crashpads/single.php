<?php get_header(); ?>
<div class="page-content">
	<div class="wrap">
		<?php while ( have_posts() ) : the_post(); ?>
			<article <?php post_class( 'entry' ); ?>>
				<h1><?php the_title(); ?></h1>
				<?php the_content(); ?>
			</article>
		<?php endwhile; ?>
	</div>
</div>
<?php get_footer(); ?>
