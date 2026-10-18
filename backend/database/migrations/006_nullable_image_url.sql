-- The image_url columns were NOT NULL, so attaching only an AR model to a plant
-- or design had to store something - the controllers wrote an invented
-- "/placeholder/<id>.jpg" path, which nothing served: every catalogue item
-- without a real photo produced a 404 on the client.
--
-- Make the columns nullable and clean up the invented paths. Rows keep their
-- ar_model_url, and clients fall back to a bundled placeholder image when
-- image_url is NULL.

ALTER TABLE plant_images MODIFY image_url VARCHAR(500) NULL;
ALTER TABLE design_images MODIFY image_url VARCHAR(500) NULL;

UPDATE plant_images
   SET image_url = NULL
 WHERE image_url LIKE '/placeholder/%' OR image_url LIKE '/api/placeholder/%';

UPDATE design_images
   SET image_url = NULL
 WHERE image_url LIKE '/placeholder/%' OR image_url LIKE '/api/placeholder/%';
